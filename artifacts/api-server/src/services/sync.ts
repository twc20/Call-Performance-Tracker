import { eq, sql } from "drizzle-orm";
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
import { gradePending } from "./grader";
import { logger } from "../lib/logger";

let running = false;

export function isSyncRunning(): boolean {
  return running;
}

async function upsertStore(name: string, brand: string | null): Promise<number> {
  const [existing] = await db.select().from(stores).where(eq(stores.name, name)).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(stores).values({ name, brand }).returning();
  return created!.id;
}

async function upsertEmployee(name: string, storeId: number | null): Promise<number> {
  const [existing] = await db.select().from(employees).where(eq(employees.name, name)).limit(1);
  if (existing) {
    if (storeId && !existing.storeId) {
      await db.update(employees).set({ storeId }).where(eq(employees.id, existing.id));
    }
    return existing.id;
  }
  const [created] = await db.insert(employees).values({ name, storeId }).returning();
  return created!.id;
}

async function upsertCustomer(phone: string, name: string | null): Promise<number> {
  const [existing] = await db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
  if (existing) {
    if (name && !existing.name) {
      await db.update(customers).set({ name }).where(eq(customers.id, existing.id));
    }
    return existing.id;
  }
  const [created] = await db.insert(customers).values({ phone, name }).returning();
  return created!.id;
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
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
    callDate: dateOnly(parsed.callDatetime),
    durationSeconds: parsed.durationSeconds,
    displayStatus: parsed.displayStatus,
    hasTranscript: parsed.hasTranscript ? 1 : 0,
    transcript: parsed.transcript,
    summary: parsed.summary,
    rawMeta: parsed.rawMeta,
    updatedAt: new Date(),
  };

  // Skip if already exists by sourceUid
  const [existing] = await db
    .select({ id: calls.id })
    .from(calls)
    .where(eq(calls.sourceUid, parsed.sourceUid))
    .limit(1);
  if (existing) return null;

  const [row] = await db.insert(calls).values(values).returning({ id: calls.id });
  return row!.id;
}

export async function runSync(runId: number): Promise<void> {
  if (running) return;
  running = true;
  let added = 0;
  let skipped = 0;
  let failed = 0;
  let seen = 0;

  try {
    logger.info({ runId }, "Sync starting");
    const files = await walkJsonFiles(CALL_DRIVE_FOLDER_ID);
    seen = files.length;
    await db
      .update(syncRuns)
      .set({ filesSeen: seen, message: `Found ${seen} JSON files` })
      .where(eq(syncRuns.id, runId));

    for (const file of files) {
      try {
        const payload = await fetchJsonFile(file.id);
        // Some dumps are arrays of multiple calls
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
      if ((added + failed) % 10 === 0) {
        await db
          .update(syncRuns)
          .set({ filesAdded: added, filesSkipped: skipped, filesFailed: failed })
          .where(eq(syncRuns.id, runId));
      }
    }

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

    const { graded, failed: gradeFailed } = await gradePending(50);

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
    .where(eq(calls.gradeStatus, "pending"));
  return { total, graded, pending };
}
