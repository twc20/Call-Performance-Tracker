import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db, calls, callGrades, criterionScores, inboxItems } from "@workspace/db";

const router: IRouter = Router();

function shape(row: typeof calls.$inferSelect, overall?: number | null) {
  return {
    id: row.id,
    sourceUid: row.sourceUid,
    store: row.storeName,
    brand: row.brand,
    employee: row.employeeName,
    customerPhone: row.customerPhone,
    customerName: row.customerName,
    direction: row.direction,
    callDatetime: row.callDatetime.toISOString(),
    durationSeconds: row.durationSeconds,
    displayStatus: row.displayStatus,
    hasTranscript: !!row.hasTranscript,
    overallGrade: overall ?? null,
    gradeStatus: row.gradeStatus,
  };
}

router.get("/calls", async (req, res) => {
  const q = req.query;
  const filters = [] as any[];
  if (q["store"]) filters.push(eq(calls.storeName, String(q["store"])));
  if (q["employee"]) filters.push(eq(calls.employeeName, String(q["employee"])));
  if (q["direction"] && q["direction"] !== "all") filters.push(eq(calls.direction, String(q["direction"])));
  if (q["status"] === "missed") filters.push(or(eq(calls.displayStatus, "missed"), eq(calls.durationSeconds, 0))!);
  if (q["status"] === "answered") filters.push(and(eq(calls.displayStatus, "answered"), sql`${calls.durationSeconds} > 0`)!);
  if (q["from"]) filters.push(gte(calls.callDate, String(q["from"])));
  if (q["to"]) filters.push(lte(calls.callDate, String(q["to"])));
  if (q["search"]) {
    const s = `%${String(q["search"])}%`;
    filters.push(or(ilike(calls.customerPhone, s), ilike(calls.customerName, s), ilike(calls.employeeName, s))!);
  }
  const where = filters.length ? and(...filters) : undefined;
  const limit = Math.min(Number(q["limit"] ?? 50), 200);
  const offset = Number(q["offset"] ?? 0);

  const rows = await db
    .select({ call: calls, grade: callGrades })
    .from(calls)
    .leftJoin(callGrades, eq(callGrades.callId, calls.id))
    .where(where)
    .orderBy(desc(calls.callDatetime))
    .limit(limit)
    .offset(offset);

  const [{ total = 0 } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(calls)
    .where(where);

  res.json({
    items: rows.map((r) => shape(r.call, r.grade ? Number(r.grade.overallScore) : null)),
    total,
  });
});

router.get("/calls/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select({ call: calls, grade: callGrades })
    .from(calls)
    .leftJoin(callGrades, eq(callGrades.callId, calls.id))
    .where(eq(calls.id, id))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Call not found" });
    return;
  }
  const call = row.call;
  const grade = row.grade;

  const scores = grade
    ? await db.select().from(criterionScores).where(eq(criterionScores.callGradeId, grade.id))
    : [];

  // Related: same phone (excluding this call) ordered by datetime
  const related = await db
    .select()
    .from(calls)
    .where(and(eq(calls.customerPhone, call.customerPhone), sql`${calls.id} <> ${call.id}`))
    .orderBy(asc(calls.callDatetime))
    .limit(20);

  // Follow-up info
  const followUp = await (async () => {
    const requires = (call.direction === "inbound" && (call.displayStatus === "missed" || call.durationSeconds === 0)) ||
      (call.direction === "inbound" && call.displayStatus === "answered" && call.durationSeconds >= 20);
    const [cb] = await db
      .select()
      .from(calls)
      .where(
        and(
          eq(calls.customerPhone, call.customerPhone),
          eq(calls.callDate, call.callDate),
          eq(calls.direction, "outbound"),
          sql`${calls.callDatetime} >= ${call.callDatetime}`,
        ),
      )
      .orderBy(asc(calls.callDatetime))
      .limit(1);
    const [inbox] = await db.select().from(inboxItems).where(eq(inboxItems.callId, call.id)).limit(1);
    return {
      requiresFollowUp: requires,
      followedUp: !!cb,
      followUpCallId: cb?.id ?? null,
      followUpAt: cb?.callDatetime.toISOString() ?? null,
      reason: inbox?.kind ?? null,
    };
  })();

  res.json({
    call: shape(call, grade ? Number(grade.overallScore) : null),
    transcript: call.transcript ?? [],
    summary: call.summary ?? [],
    grade: grade
      ? {
          overallScore: Number(grade.overallScore),
          summary: grade.summary,
          coachingNotes: grade.coachingNotes,
          strengths: grade.strengths ?? [],
          improvements: grade.improvements ?? [],
          criterionScores: scores.map((s) => ({
            criterionId: s.criterionId ?? 0,
            criterionName: s.criterionName,
            score: Number(s.score),
            note: s.note,
            evidence: s.evidence,
          })),
          model: grade.model,
          gradedAt: grade.gradedAt.toISOString(),
        }
      : undefined,
    relatedCalls: related.map((c) => ({
      id: c.id,
      direction: c.direction,
      callDatetime: c.callDatetime.toISOString(),
      durationSeconds: c.durationSeconds,
      displayStatus: c.displayStatus,
      employee: c.employeeName,
      store: c.storeName,
    })),
    followUp,
  });
});

export default router;
