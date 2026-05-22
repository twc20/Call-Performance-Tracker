import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db, calls, callGrades, inboxItems } from "@workspace/db";
import { ResolveInboxItemBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/inbox", async (req, res) => {
  const filters = [] as any[];
  const includeResolved = req.query["includeResolved"] === "true";
  if (!includeResolved) filters.push(eq(inboxItems.resolved, false));
  if (req.query["date"]) filters.push(eq(inboxItems.callDate, String(req.query["date"])));
  if (req.query["from"]) filters.push(gte(inboxItems.callDate, String(req.query["from"])));
  if (req.query["to"]) filters.push(lte(inboxItems.callDate, String(req.query["to"])));
  if (req.query["store"]) filters.push(eq(calls.storeName, String(req.query["store"])));

  // Newest first so today's misses surface at the top of the inbox.
  const order = includeResolved
    ? [desc(inboxItems.resolved), desc(calls.callDatetime)]
    : [desc(calls.callDatetime)];

  const rows = await db
    .select({ item: inboxItems, call: calls, grade: callGrades })
    .from(inboxItems)
    .innerJoin(calls, eq(calls.id, inboxItems.callId))
    .leftJoin(callGrades, eq(callGrades.callId, calls.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(...order)
    .limit(1000);

  res.json(
    rows.map((r) => ({
      id: r.item.id,
      callId: r.call.id,
      kind: r.item.kind,
      customerPhone: r.call.customerPhone,
      customerName: r.call.customerName,
      store: r.call.storeName,
      employee: r.call.employeeName,
      callDatetime: r.call.callDatetime.toISOString(),
      summary: (r.call.summary ?? [])[0] ?? r.grade?.summary ?? null,
      overallGrade: r.grade ? Number(r.grade.overallScore) : null,
      resolved: r.item.resolved,
      resolvedAt: r.item.resolvedAt?.toISOString() ?? null,
      resolvedNote: r.item.resolvedNote,
    })),
  );
});

router.post("/inbox/:id/resolve", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = ResolveInboxItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const body = parsed.data;
  const [updated] = await db
    .update(inboxItems)
    .set({
      resolved: body.resolved,
      resolvedAt: body.resolved ? new Date() : null,
      resolvedNote: body.note ?? null,
    })
    .where(eq(inboxItems.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [row] = await db
    .select({ item: inboxItems, call: calls, grade: callGrades })
    .from(inboxItems)
    .innerJoin(calls, eq(calls.id, inboxItems.callId))
    .leftJoin(callGrades, eq(callGrades.callId, calls.id))
    .where(eq(inboxItems.id, id))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({
    id: row.item.id,
    callId: row.call.id,
    kind: row.item.kind,
    customerPhone: row.call.customerPhone,
    customerName: row.call.customerName,
    store: row.call.storeName,
    employee: row.call.employeeName,
    callDatetime: row.call.callDatetime.toISOString(),
    summary: (row.call.summary ?? [])[0] ?? row.grade?.summary ?? null,
    overallGrade: row.grade ? Number(row.grade.overallScore) : null,
    resolved: row.item.resolved,
    resolvedAt: row.item.resolvedAt?.toISOString() ?? null,
    resolvedNote: row.item.resolvedNote,
  });
});

// Avoid unused import warning when sql is not directly referenced
void sql;

export default router;
