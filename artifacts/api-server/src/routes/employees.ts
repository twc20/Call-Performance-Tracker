import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, calls, callGrades, criterionScores } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/employees", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      c.employee_name AS name,
      COUNT(*)::int AS "totalCalls",
      SUM(CASE WHEN g.id IS NOT NULL THEN 1 ELSE 0 END)::int AS "gradedCalls",
      AVG(g.overall_score)::float AS "averageGrade",
      (ARRAY_AGG(DISTINCT c.store_name))[1] AS store
    FROM calls c
    LEFT JOIN call_grades g ON g.call_id = c.id
    WHERE c.employee_name IS NOT NULL
    GROUP BY c.employee_name
    ORDER BY "totalCalls" DESC
  `);
  res.json(rows.rows);
});

router.get("/coaching/employees/:name", async (req, res) => {
  const name = decodeURIComponent(req.params["name"] ?? "");

  const [summary] = (
    await db.execute(sql`
    SELECT
      COUNT(*)::int AS "totalCalls",
      SUM(CASE WHEN g.id IS NOT NULL THEN 1 ELSE 0 END)::int AS "gradedCalls",
      AVG(g.overall_score)::float AS "averageGrade",
      (ARRAY_AGG(DISTINCT c.store_name))[1] AS store
    FROM calls c
    LEFT JOIN call_grades g ON g.call_id = c.id
    WHERE c.employee_name = ${name}
  `)
  ).rows as Array<{ totalCalls: number; gradedCalls: number; averageGrade: number | null; store: string | null }>;

  if (!summary || summary.totalCalls === 0) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }

  const criterionAverages = (
    await db.execute(sql`
    SELECT
      cs.criterion_id AS "criterionId",
      cs.criterion_name AS "criterionName",
      AVG(cs.score)::float AS "averageScore",
      COUNT(*)::int AS calls
    FROM criterion_scores cs
    JOIN call_grades g ON g.id = cs.call_grade_id
    JOIN calls c ON c.id = g.call_id
    WHERE c.employee_name = ${name}
    GROUP BY cs.criterion_id, cs.criterion_name
    ORDER BY "averageScore" DESC
  `)
  ).rows;

  const strengthRows = (
    await db.execute(sql`
    SELECT jsonb_array_elements_text(g.strengths) AS item, COUNT(*)::int AS n
    FROM call_grades g
    JOIN calls c ON c.id = g.call_id
    WHERE c.employee_name = ${name}
    GROUP BY item
    ORDER BY n DESC
    LIMIT 5
  `)
  ).rows as Array<{ item: string; n: number }>;
  const improvementRows = (
    await db.execute(sql`
    SELECT jsonb_array_elements_text(g.improvements) AS item, COUNT(*)::int AS n
    FROM call_grades g
    JOIN calls c ON c.id = g.call_id
    WHERE c.employee_name = ${name}
    GROUP BY item
    ORDER BY n DESC
    LIMIT 5
  `)
  ).rows as Array<{ item: string; n: number }>;

  async function topCall(order: "DESC" | "ASC") {
    const sqlText = order === "DESC"
      ? sql`SELECT c.*, g.overall_score::float AS overall_score FROM calls c JOIN call_grades g ON g.call_id = c.id WHERE c.employee_name = ${name} ORDER BY g.overall_score DESC NULLS LAST LIMIT 1`
      : sql`SELECT c.*, g.overall_score::float AS overall_score FROM calls c JOIN call_grades g ON g.call_id = c.id WHERE c.employee_name = ${name} ORDER BY g.overall_score ASC NULLS LAST LIMIT 1`;
    const r = await db.execute(sqlText);
    return r.rows[0] ?? null;
  }
  const best = await topCall("DESC");
  const worst = await topCall("ASC");

  const recent = await db
    .select({
      call: calls,
      grade: callGrades,
    })
    .from(calls)
    .leftJoin(callGrades, eq(callGrades.callId, calls.id))
    .where(eq(calls.employeeName, name))
    .orderBy(desc(calls.callDatetime))
    .limit(10);

  const shapeCall = (row: any) => ({
    id: row.id,
    sourceUid: row.source_uid ?? row.sourceUid,
    store: row.store_name ?? row.storeName,
    brand: row.brand ?? null,
    employee: row.employee_name ?? row.employeeName ?? null,
    customerPhone: row.customer_phone ?? row.customerPhone,
    customerName: row.customer_name ?? row.customerName ?? null,
    direction: row.direction,
    callDatetime: (row.call_datetime ?? row.callDatetime).toISOString?.() ?? row.call_datetime ?? row.callDatetime,
    durationSeconds: row.duration_seconds ?? row.durationSeconds,
    displayStatus: row.display_status ?? row.displayStatus,
    hasTranscript: !!(row.has_transcript ?? row.hasTranscript),
    overallGrade: row.overall_score ?? null,
    gradeStatus: row.grade_status ?? row.gradeStatus,
  });

  res.json({
    employee: name,
    store: summary.store,
    totalCalls: summary.totalCalls,
    gradedCalls: summary.gradedCalls,
    averageGrade: summary.averageGrade ?? 0,
    criterionAverages,
    topStrengths: strengthRows.map((r) => r.item),
    topImprovements: improvementRows.map((r) => r.item),
    bestCall: best ? shapeCall(best) : null,
    worstCall: worst ? shapeCall(worst) : null,
    recentCalls: recent.map((r) => ({
      ...shapeCall(r.call),
      overallGrade: r.grade ? Number(r.grade.overallScore) : null,
    })),
  });
});

export default router;
