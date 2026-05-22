import { and, eq, sql } from "drizzle-orm";
import { db, calls, inboxItems } from "@workspace/db";
import type { Call } from "@workspace/db";

// A "shopper" is an inbound, answered call where the customer is pricing or
// asking questions. For v1 we treat every answered inbound > 20s as a shopper
// candidate (the grader will refine this later). A "missed" call is any
// inbound call with displayStatus = missed or duration 0.

function isShopper(c: Call): boolean {
  return c.direction === "inbound" && c.displayStatus === "answered" && c.durationSeconds >= 20;
}

function isMissed(c: Call): boolean {
  return c.direction === "inbound" && (c.displayStatus === "missed" || c.durationSeconds === 0);
}

// Returns true when there is an outbound call to the same phone on the same
// local date that happened AFTER the inbound call.
async function hasSameDayCallback(phone: string, callDate: string, after: Date): Promise<boolean> {
  // Skip cross-reference for unknown phones — they'd false-match each other.
  if (phone === "unknown") return false;
  const rows = await db
    .select({ id: calls.id })
    .from(calls)
    .where(
      and(
        eq(calls.customerPhone, phone),
        eq(calls.callDate, callDate),
        eq(calls.direction, "outbound"),
        sql`${calls.callDatetime} >= ${after}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function refreshInboxForCall(callId: number): Promise<void> {
  const [call] = await db.select().from(calls).where(eq(calls.id, callId));
  if (!call) return;

  const candidate = (isShopper(call) || isMissed(call)) && call.customerPhone !== "unknown";
  if (!candidate) {
    await db.delete(inboxItems).where(eq(inboxItems.callId, callId));
    return;
  }

  const followedUp = await hasSameDayCallback(call.customerPhone, call.callDate, call.callDatetime);
  if (followedUp) {
    await db.delete(inboxItems).where(eq(inboxItems.callId, callId));
    return;
  }

  const kind = isShopper(call) ? "shopper_no_followup" : "missed_no_callback";

  const [existing] = await db
    .select()
    .from(inboxItems)
    .where(eq(inboxItems.callId, callId))
    .limit(1);
  if (existing) {
    if (existing.kind !== kind) {
      await db.update(inboxItems).set({ kind }).where(eq(inboxItems.id, existing.id));
    }
    return;
  }

  await db.insert(inboxItems).values({
    callId,
    kind,
    customerPhone: call.customerPhone,
    callDate: call.callDate,
  });
}

// When an outbound call is ingested, any open inbox items for the same phone +
// date that occurred earlier in the day should be auto-resolved.
export async function resolveInboxOnCallback(outbound: Call): Promise<void> {
  if (outbound.direction !== "outbound") return;
  const earlier = await db
    .select({ id: calls.id })
    .from(calls)
    .where(
      and(
        eq(calls.customerPhone, outbound.customerPhone),
        eq(calls.callDate, outbound.callDate),
        eq(calls.direction, "inbound"),
        sql`${calls.callDatetime} <= ${outbound.callDatetime}`,
      ),
    );
  if (!earlier.length) return;
  const ids = earlier.map((r) => r.id);
  await db.delete(inboxItems).where(sql`${inboxItems.callId} IN ${ids}`);
}
