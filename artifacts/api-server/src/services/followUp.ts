import { and, eq, sql } from "drizzle-orm";
import { db, calls, callGrades, inboxItems } from "@workspace/db";
import type { Call } from "@workspace/db";

// Inbox classification, two-phase:
//   1. At ingest time we only create MISSED items (open-hours / after-hours).
//      Shopper follow-up items are NOT created here — they require the
//      grader's intent classification to avoid false positives like a
//      customer calling about a vehicle already in the shop.
//   2. After grading, syncShopperInboxAfterGrade() runs and creates or
//      removes a shopper_no_followup item based on the Gemini callIntent.

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

  // At ingest time we only handle MISSED items here. shopper_no_followup is
  // created by syncShopperInboxAfterGrade() once the grader has classified
  // the call's intent.
  if (!isMissed(call) || call.customerPhone === "unknown") {
    // Remove any existing missed-* item (shopper items are owned by the
    // grading path and must not be touched here).
    await db
      .delete(inboxItems)
      .where(
        and(
          eq(inboxItems.callId, callId),
          sql`${inboxItems.kind} IN ('missed_no_callback', 'missed_after_hours', 'missed_voicemail')`,
        ),
      );
    return;
  }

  const followedUp = await hasSameDayCallback(call.customerPhone, call.callDate, call.callDatetime);
  if (followedUp) {
    await db
      .delete(inboxItems)
      .where(
        and(
          eq(inboxItems.callId, callId),
          sql`${inboxItems.kind} IN ('missed_no_callback', 'missed_after_hours', 'missed_voicemail')`,
        ),
      );
    return;
  }

  // Voicemails are a stronger signal than a ring-and-hangup, so they get
  // their own inbox kind regardless of after-hours.
  const kind = call.isVoicemail
    ? "missed_voicemail"
    : call.isAfterHours
      ? "missed_after_hours"
      : "missed_no_callback";

  // Only consider missed-kind rows here. Shopper rows are owned exclusively
  // by syncShopperInboxAfterGrade and must not be mutated by ingest.
  const [existing] = await db
    .select()
    .from(inboxItems)
    .where(
      and(
        eq(inboxItems.callId, callId),
        sql`${inboxItems.kind} IN ('missed_no_callback', 'missed_after_hours', 'missed_voicemail')`,
      ),
    )
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

// Called from the grading transaction. Decides whether the freshly-graded
// call should appear in the inbox as a shopper that needs a follow-up.
//
// Rules:
//   - Only inbound, answered calls qualify (missed calls are owned by the
//     ingest-time path above).
//   - The grader must have classified the call's callIntent as
//     "shopper_inquiry". Anything else (existing customer, service status,
//     complaint, etc.) is explicitly skipped.
//   - If there was an outbound callback to the same phone the same day, the
//     follow-up is already done — nothing to flag.
export async function syncShopperInboxAfterGrade(callId: number): Promise<void> {
  const [call] = await db.select().from(calls).where(eq(calls.id, callId));
  if (!call) return;

  const removeExistingShopper = async () => {
    await db
      .delete(inboxItems)
      .where(and(eq(inboxItems.callId, callId), eq(inboxItems.kind, "shopper_no_followup")));
  };

  const isAnsweredInbound =
    call.direction === "inbound" &&
    call.displayStatus === "answered" &&
    call.durationSeconds >= 20 &&
    call.customerPhone !== "unknown";
  if (!isAnsweredInbound) {
    await removeExistingShopper();
    return;
  }

  const [grade] = await db
    .select({ intent: callGrades.callIntent })
    .from(callGrades)
    .where(eq(callGrades.callId, callId))
    .limit(1);
  if (!grade || grade.intent !== "shopper_inquiry") {
    await removeExistingShopper();
    return;
  }

  const followedUp = await hasSameDayCallback(
    call.customerPhone,
    call.callDate,
    call.callDatetime,
  );
  if (followedUp) {
    await removeExistingShopper();
    return;
  }

  const [existing] = await db
    .select()
    .from(inboxItems)
    .where(eq(inboxItems.callId, callId))
    .limit(1);
  if (existing) {
    if (existing.kind !== "shopper_no_followup") {
      await db
        .update(inboxItems)
        .set({ kind: "shopper_no_followup" })
        .where(eq(inboxItems.id, existing.id));
    }
    return;
  }

  await db.insert(inboxItems).values({
    callId,
    kind: "shopper_no_followup",
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
