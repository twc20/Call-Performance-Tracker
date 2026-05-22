import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  status: text("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  filesSeen: integer("files_seen").notNull().default(0),
  filesAdded: integer("files_added").notNull().default(0),
  filesSkipped: integer("files_skipped").notNull().default(0),
  filesFailed: integer("files_failed").notNull().default(0),
  message: text("message"),
});

export type SyncRun = typeof syncRuns.$inferSelect;
