import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, calls, syncRuns } from "@workspace/db";
import { isSyncRunning, runSync, getCounts } from "../services/sync";

const router: IRouter = Router();

router.get("/sync/status", async (_req, res) => {
  const counts = await getCounts();
  const [last] = await db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1);
  res.json({
    totalCalls: counts.total,
    gradedCalls: counts.graded,
    pendingGrade: counts.pending,
    lastSyncAt: last?.finishedAt?.toISOString() ?? last?.startedAt.toISOString() ?? null,
    lastSyncStatus: last?.status ?? null,
    lastSyncMessage: last?.message ?? null,
    lastSyncFilesAdded: last?.filesAdded ?? null,
    running: isSyncRunning(),
  });
});

router.post("/sync/run", async (req, res) => {
  if (isSyncRunning()) {
    const [last] = await db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1);
    res.status(202).json({ started: false, runId: last?.id ?? 0 });
    return;
  }
  const fullBackfill = req.query["full"] === "true" || req.body?.full === true;
  const [run] = await db
    .insert(syncRuns)
    .values({ status: "running", message: fullBackfill ? "Full backfill starting…" : null })
    .returning();
  if (!run) {
    res.status(500).json({ error: "Failed to start sync" });
    return;
  }
  void runSync(run.id, { fullBackfill }).catch((err) => req.log.error({ err }, "Sync run failed"));
  res.status(202).json({ started: true, runId: run.id, fullBackfill });
});

// Re-grade a single call (re-runs Gemini against the current rubric)
router.post("/calls/:id/regrade", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await db.update(calls).set({ gradeStatus: "pending", gradeError: null }).where(eq(calls.id, id));
    const { gradeCallById } = await import("../services/grader");
    await gradeCallById(id);
    // Hand off to the call detail handler by redirect-style fetch
    res.redirect(307, `/api/calls/${id}`);
  } catch (err) {
    next(err);
  }
});

export default router;
