import { eq, and, isNull } from "drizzle-orm";
import { db, calls, rubricCriteria, callGrades, criterionScores } from "@workspace/db";
import type { Call, RubricCriterion } from "@workspace/db";
import { getGeminiClient, GRADER_MODEL } from "../lib/gemini";
import { logger } from "../lib/logger";

interface ModelCriterionScore {
  criterionName: string;
  score: number;
  note?: string;
  evidence?: string;
}

interface ModelGradeOutput {
  overallScore: number;
  summary: string;
  coachingNotes?: string;
  strengths: string[];
  improvements: string[];
  criterionScores: ModelCriterionScore[];
}

function buildPrompt(call: Call, criteria: RubricCriterion[]): string {
  const criteriaText = criteria
    .map((c, i) => `${i + 1}. ${c.name} (weight ${c.weight}) — ${c.description}`)
    .join("\n");

  const transcriptText = (call.transcript || [])
    .map((l) =>
      `${l.timestamp ? `[${l.timestamp}] ` : ""}${l.speaker ? `${l.speaker}: ` : ""}${l.text}`,
    )
    .join("\n")
    .slice(0, 24000);

  const summaryText = (call.summary || []).join("\n").slice(0, 4000);

  return `You are an elite sales coach trained in Alex Hormozi's value-equation and Grand Slam Offer methodology, grading a real phone call between a tire-store employee and a customer.

CALL METADATA
- Store: ${call.storeName}
- Employee: ${call.employeeName ?? "unknown"}
- Direction: ${call.direction}
- Duration: ${call.durationSeconds}s
- Status: ${call.displayStatus}
- Customer phone: ${call.customerPhone}
- Customer name: ${call.customerName ?? "unknown"}

EXISTING SUMMARY (may be empty)
${summaryText || "(none)"}

TRANSCRIPT
${transcriptText || "(no transcript available — base your grade only on metadata and existing summary, and lower scores accordingly)"}

RUBRIC CRITERIA
${criteriaText}

INSTRUCTIONS
- Score every rubric criterion 0-5 (whole or half points). 0 = absent, 3 = competent, 5 = elite.
- For each criterion, give a one-sentence note and a short evidence quote from the transcript when possible.
- Compute the overall score as the weighted average mapped to a 0-100 scale (weighted_mean / 5 * 100).
- Summary: 1-2 sentences describing what happened and the outcome.
- coachingNotes: one paragraph of direct, specific coaching the employee can act on tomorrow.
- strengths: 2-3 short bullets of what the rep did well.
- improvements: 2-3 short bullets of the highest-leverage things to fix.
- Be honest. Missed callbacks, no price given, no appointment booked, and no follow-up commitment are major deductions.
- Return ONLY a JSON object that matches the response schema. No prose.`;
}

const responseSchema = {
  type: "object",
  properties: {
    overallScore: { type: "number" },
    summary: { type: "string" },
    coachingNotes: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
    criterionScores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          criterionName: { type: "string" },
          score: { type: "number" },
          note: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["criterionName", "score"],
      },
    },
  },
  required: ["overallScore", "summary", "strengths", "improvements", "criterionScores"],
};

export async function gradeCallById(callId: number): Promise<void> {
  const [call] = await db.select().from(calls).where(eq(calls.id, callId));
  if (!call) throw new Error(`Call ${callId} not found`);
  await gradeCall(call);
}

export async function gradeCall(call: Call): Promise<void> {
  const activeCriteria = await db
    .select()
    .from(rubricCriteria)
    .where(and(eq(rubricCriteria.active, true), isNull(rubricCriteria.deletedAt)));

  const applicable = activeCriteria.filter(
    (c) => c.appliesTo === "all" || c.appliesTo === call.direction,
  );

  if (applicable.length === 0) {
    await db
      .update(calls)
      .set({ gradeStatus: "skipped", gradeError: "no active criteria", updatedAt: new Date() })
      .where(eq(calls.id, call.id));
    return;
  }

  if (!call.hasTranscript && (call.summary?.length ?? 0) === 0) {
    await db
      .update(calls)
      .set({ gradeStatus: "skipped", gradeError: "no transcript or summary", updatedAt: new Date() })
      .where(eq(calls.id, call.id));
    return;
  }

  const prompt = buildPrompt(call, applicable);

  try {
    const client = getGeminiClient();
    const resp = await client.models.generateContent({
      model: GRADER_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema as never,
        temperature: 0.2,
      },
    });

    const text = resp.text;
    if (!text) throw new Error("Empty grader response");
    const parsed = JSON.parse(text) as ModelGradeOutput;

    await db.transaction(async (tx) => {
      await tx.delete(callGrades).where(eq(callGrades.callId, call.id));
      const [grade] = await tx
        .insert(callGrades)
        .values({
          callId: call.id,
          overallScore: String(clamp(parsed.overallScore, 0, 100)),
          summary: parsed.summary ?? "",
          coachingNotes: parsed.coachingNotes ?? null,
          strengths: parsed.strengths ?? [],
          improvements: parsed.improvements ?? [],
          model: GRADER_MODEL,
          rubricVersion: "v1",
        })
        .returning();

      if (!grade) throw new Error("Failed to insert grade");

      const rows = (parsed.criterionScores ?? []).map((s) => {
        const match = applicable.find(
          (c) => c.name.toLowerCase() === s.criterionName.toLowerCase(),
        );
        return {
          callGradeId: grade.id,
          criterionId: match?.id ?? null,
          criterionName: s.criterionName,
          score: String(clamp(s.score, 0, 5)),
          note: s.note ?? null,
          evidence: s.evidence ?? null,
        };
      });
      if (rows.length) await tx.insert(criterionScores).values(rows);

      await tx
        .update(calls)
        .set({ gradeStatus: "graded", gradeError: null, updatedAt: new Date() })
        .where(eq(calls.id, call.id));
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, callId: call.id }, "Grading failed");
    await db
      .update(calls)
      .set({ gradeStatus: "error", gradeError: msg.slice(0, 500), updatedAt: new Date() })
      .where(eq(calls.id, call.id));
    throw err;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export async function gradePending(limit = 25): Promise<{ graded: number; failed: number }> {
  const pending = await db
    .select()
    .from(calls)
    .where(eq(calls.gradeStatus, "pending"))
    .limit(limit);

  let graded = 0;
  let failed = 0;
  for (const call of pending) {
    try {
      await gradeCall(call);
      graded += 1;
    } catch {
      failed += 1;
    }
  }
  return { graded, failed };
}
