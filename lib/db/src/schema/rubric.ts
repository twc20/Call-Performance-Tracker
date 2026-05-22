import { boolean, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const rubricCriteria = pgTable("rubric_criteria", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  weight: numeric("weight", { precision: 6, scale: 2 }).notNull().default("1"),
  active: boolean("active").notNull().default(true),
  appliesTo: text("applies_to").notNull().default("inbound"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RubricCriterion = typeof rubricCriteria.$inferSelect;
