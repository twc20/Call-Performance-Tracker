import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { calls } from "./calls";
import { rubricCriteria } from "./rubric";

export const callGrades = pgTable(
  "call_grades",
  {
    id: serial("id").primaryKey(),
    callId: integer("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    overallScore: numeric("overall_score", { precision: 6, scale: 2 }).notNull(),
    summary: text("summary").notNull(),
    coachingNotes: text("coaching_notes"),
    strengths: jsonb("strengths").$type<string[]>().notNull().default([]),
    improvements: jsonb("improvements").$type<string[]>().notNull().default([]),
    model: text("model").notNull(),
    rubricVersion: text("rubric_version").notNull().default("v1"),
    // Gemini-classified intent of the call. Drives whether the call appears in
    // the "shopper needs follow-up" inbox — only "shopper_inquiry" qualifies.
    // Possible values: shopper_inquiry | existing_customer | appointment |
    // service_status | complaint | other. Nullable for older grades.
    callIntent: text("call_intent"),
    gradedAt: timestamp("graded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("call_grades_call_uq").on(t.callId)],
);

export const criterionScores = pgTable(
  "criterion_scores",
  {
    id: serial("id").primaryKey(),
    callGradeId: integer("call_grade_id")
      .notNull()
      .references(() => callGrades.id, { onDelete: "cascade" }),
    criterionId: integer("criterion_id").references(() => rubricCriteria.id),
    criterionName: text("criterion_name").notNull(),
    score: numeric("score", { precision: 5, scale: 2 }).notNull(),
    note: text("note"),
    evidence: text("evidence"),
  },
  (t) => [index("criterion_scores_grade_idx").on(t.callGradeId)],
);

export type CallGrade = typeof callGrades.$inferSelect;
export type CriterionScore = typeof criterionScores.$inferSelect;
