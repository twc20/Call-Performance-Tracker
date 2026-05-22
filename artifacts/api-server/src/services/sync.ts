import { eq, sql, and } from "drizzle-orm";
import {
  db,
  calls,
  customers,
  employees,
  stores,
  syncRuns,
} from "@workspace/db";
import { walkJsonFiles, fetchJsonFile, CALL_DRIVE_FOLDER_ID } from "../lib/drive";
import { parseCallJson, type ParsedCall } from "./parser";
import { refreshInboxForCall, resolveInboxOnCallback } from "./followUp";
import { gradePending, GRADING_WINDOW_MONTHS } from "./grader";
import { logger } from "../lib/logger";

let running = false;

export function isSyncRunning(): boolean {
  return running;
}

// Mark any sync_runs row left as 'running' from a prior process as an orphan failure.
export async function reapOrphanSyncRuns(): Promise<void> {
  const orphans = await db
    .update(syncRuns)
    .set({
      status: "error",
      finishedAt: new Date(),
      message: "Process restarted before sync completed",
    })
    .where(eq(syncRuns.status, "running"))
    .returning({ id: syncRuns.id });
  if (orphans.length > 0) {
    logger.warn({ count: orphans.length, ids: orphans.map((o) => o.id) }, "Reaped orphan sync runs");
  }
}

async function upsertStore(name: string, brand: string | null): Promise<number> {
  const [row] = await db
    .insert(stores)
    .values({ name, brand })
    .onConflictDoUpdate({
      target: stores.name,
      set: { name: sql`excluded.name` },
    })
    .returning({ id: stores.id });
  return row!.id;
}

async function upsertEmployee(name: string, storeId: number | null): Promise<number> {
  const [row] = await db
    .insert(employees)
    .values({ name, storeId })
    .onConflictDoUpdate({
      target: employees.name,
      set: storeId
        ? { storeId: sql`COALESCE(${employees.storeId}, ${storeId})` }
        : { name: sql`excluded.name` },
    })
    .returning({ id: employees.id });
  return row!.id;
}

async function upsertCustomer(phone: string, name: string | null): Promise<number> {
  const [row] = await db
    .insert(customers)
    .values({ phone, name })
    .onConflictDoUpdate({
      target: customers.phone,
      set: name
        ? { name: sql`COALESCE(${customers.name}, ${name})` }
        : { phone: sql`excluded.phone` },
    })
    .returning({ id: customers.id });
  return row!.id;
}

// Stores' local-day grouping. Delta Tire operates on Mountain Time; a call at
// 11:58 PM Mountain (~05:58 UTC the next day) belongs to the operator's
// previous workday, so we group by Denver-local date, not UTC.
const STORE_TZ = process.env.STORE_TIMEZONE ?? "America/Denver";
function dateOnly(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts; // en-CA yields YYYY-MM-DD
}

async function upsertCall(parsed: ParsedCall, fileId: string, filePath: string): Promise<number | null> {
  const storeId = await upsertStore(parsed.storeName, parsed.brand);
  const employeeId = parsed.employeeName ? await upsertEmployee(parsed.employeeName, storeId) : null;
  const customerId = await upsertCustomer(parsed.customerPhone, parsed.customerName);

  const values = {
    sourceUid: parsed.sourceUid,
    sourceFileId: fileId,
    sourcePath: filePath,
    storeId,
    storeName: parsed.storeName,
    brand: parsed.brand,
    employeeId,
    employeeName: parsed.employeeName,
    customerId,
    customerPhone: parsed.customerPhone,
    customerName: parsed.customerName,
    direction: parsed.direction,
    callDatetime: parsed.callDatetime,
    callDate: parsed.callDate ?? dateOnly(parsed.callDatetime),
    durationSeconds: parsed.durationSeconds,
    displayStatus: parsed.displayStatus,
    isAfterHours: parsed.isAfterHours,
    hasTranscript: parsed.hasTranscript ? 1 : 0,
    transcript: parsed.transcript,
    summary: parsed.summary,
    rawMeta: parsed.rawMeta,
    updatedAt: new Date(),
  };

  // Atomic idempotent insert: races between workers on the same source_uid
  // resolve to "skipped" instead of throwing a unique-constraint failure.
  const rows = await db
    .insert(calls)
    .values(values)
    .onConflictDoNothing({ target: calls.sourceUid })
    .returning({ id: calls.id });
  return rows[0]?.id ?? null;
}

const SYNC_WINDOW_DAYS = Number(process.env.SYNC_WINDOW_DAYS ?? 30);

export async function runSync(runId: number, opts: { fullBackfill?: boolean } = {}): Promise<void> {
  const fullBackfill = opts.fullBackfill === true;
  // Flip the in-process flag atomically so concurrent /sync/run requests can't
  // both pass the isSyncRunning() check and create dueling runs.
  if (running) {
    await db
      .update(syncRuns)
      .set({ status: "error", finishedAt: new Date(), message: "Another sync was already running" })
      .where(eq(syncRuns.id, runId));
    return;
  }
  running = true;
  let added = 0;
  let skipped = 0;
  let failed = 0;
  let seen = 0;

  try {
    const sinceDate = fullBackfill
      ? undefined
      : new Date(Date.now() - SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    logger.info(
      { runId, sinceDate, windowDays: fullBackfill ? "ALL" : SYNC_WINDOW_DAYS, fullBackfill },
      "Sync starting",
    );
    const files = await walkJsonFiles(CALL_DRIVE_FOLDER_ID, {
      ...(sinceDate ? { sinceDate } : {}),
      onProgress: (msg) => logger.info({ runId }, msg),
    });
    seen = files.length;
    await db
      .update(syncRuns)
      .set({ filesSeen: seen, message: `Found ${seen} JSON files` })
      .where(eq(syncRuns.id, runId));

    const CONCURRENCY = Number(process.env.SYNC_CONCURRENCY ?? 4);
    const processFile = async (file: (typeof files)[number]) => {
      try {
        const payload = await fetchJsonFile(file.id);
        const items = Array.isArray(payload) ? payload : [payload];
        for (const item of items) {
          const parsed = parseCallJson(item, file.path);
          if (!parsed) {
            skipped += 1;
            continue;
          }
          const newId = await upsertCall(parsed, file.id, file.path);
          if (newId == null) {
            skipped += 1;
            continue;
          }
          added += 1;
          await refreshInboxForCall(newId);
          if (parsed.direction === "outbound") {
            const [c] = await db.select().from(calls).where(eq(calls.id, newId));
            if (c) await resolveInboxOnCallback(c);
          }
        }
      } catch (err) {
        failed += 1;
        logger.warn({ err, file: file.path }, "Failed to ingest file");
      }
      if ((added + failed) % 25 === 0) {
        await db
          .update(syncRuns)
          .set({ filesAdded: added, filesSkipped: skipped, filesFailed: failed })
          .where(eq(syncRuns.id, runId));
      }
    };

    let cursor = 0;
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= files.length) return;
        await processFile(files[idx]!);
      }
    });
    await Promise.all(workers);

    // Grade what we just added — bounded so the sync completes in reasonable time.
    await db
      .update(syncRuns)
      .set({
        filesAdded: added,
        filesSkipped: skipped,
        filesFailed: failed,
        message: `Ingested ${added} new calls — grading…`,
      })
      .where(eq(syncRuns.id, runId));

    // Full backfills lift the per-run cap so the recent grading window (last
    // 6 months — see GRADING_WINDOW_MONTHS in grader.ts) is drained in one go;
    // routine syncs stay bounded so a typical run completes quickly.
    const gradeCap = fullBackfill ? 10_000 : 50;
    const { graded, failed: gradeFailed } = await gradePending(gradeCap);

    await db
      .update(syncRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        filesAdded: added,
        filesSkipped: skipped,
        filesFailed: failed,
        message: `Added ${added}, graded ${graded}${gradeFailed ? `, grade-failed ${gradeFailed}` : ""}`,
      })
      .where(eq(syncRuns.id, runId));
    logger.info({ runId, added, skipped, failed, graded }, "Sync complete");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, runId }, "Sync failed");
    await db
      .update(syncRuns)
      .set({
        status: "error",
        finishedAt: new Date(),
        message: msg.slice(0, 500),
        filesAdded: added,
        filesSkipped: skipped,
        filesFailed: failed,
      })
      .where(eq(syncRuns.id, runId));
  } finally {
    running = false;
  }
}

export async function getCounts() {
  const [{ total = 0 } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(calls);
  const [{ graded = 0 } = { graded: 0 }] = await db
    .select({ graded: sql<number>`count(*)::int` })
    .from(calls)
    .where(eq(calls.gradeStatus, "graded"));
  const [{ pending = 0 } = { pending: 0 }] = await db
    .select({ pending: sql<number>`count(*)::int` })
    .from(calls)
    .where(
      and(
        eq(calls.gradeStatus, "pending"),
        sql`${calls.callDatetime} >= NOW() - INTERVAL '${sql.raw(String(GRADING_WINDOW_MONTHS))} months'`,
      ),
    );
  return { total, graded, pending };
}
