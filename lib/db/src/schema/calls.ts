import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { stores } from "./stores";
import { employees } from "./employees";
import { customers } from "./customers";

export type TranscriptLine = { speaker: string; timestamp: string; text: string };

export const calls = pgTable(
  "calls",
  {
    id: serial("id").primaryKey(),
    sourceUid: text("source_uid").notNull(),
    sourceFileId: text("source_file_id"),
    sourcePath: text("source_path"),
    storeId: integer("store_id").references(() => stores.id),
    storeName: text("store_name").notNull(),
    brand: text("brand"),
    employeeId: integer("employee_id").references(() => employees.id),
    employeeName: text("employee_name"),
    customerId: integer("customer_id").references(() => customers.id),
    customerPhone: text("customer_phone").notNull(),
    customerName: text("customer_name"),
    direction: text("direction").notNull(),
    callDatetime: timestamp("call_datetime", { withTimezone: true }).notNull(),
    callDate: text("call_date").notNull(),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    displayStatus: text("display_status").notNull().default("answered"),
    hasTranscript: integer("has_transcript").notNull().default(0),
    transcript: jsonb("transcript").$type<TranscriptLine[]>().notNull().default([]),
    summary: jsonb("summary").$type<string[]>().notNull().default([]),
    rawMeta: jsonb("raw_meta").$type<Record<string, unknown>>(),
    gradeStatus: text("grade_status").notNull().default("pending"),
    gradeError: text("grade_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("calls_source_uid_uq").on(t.sourceUid),
    index("calls_phone_date_idx").on(t.customerPhone, t.callDate),
    index("calls_datetime_idx").on(t.callDatetime),
    index("calls_employee_idx").on(t.employeeName),
    index("calls_store_idx").on(t.storeName),
    index("calls_direction_idx").on(t.direction),
    // Partial composite index supports the follow-up / inbox / dashboard
    // callback joins. Excludes 'unknown' rows since they're never matched.
    index("calls_callback_lookup_idx")
      .on(t.customerPhone, t.callDate, t.direction, t.callDatetime)
      .where(sql`${t.customerPhone} <> 'unknown'`),
  ],
);

export type Call = typeof calls.$inferSelect;
