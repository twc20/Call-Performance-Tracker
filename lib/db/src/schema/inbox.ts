import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { calls } from "./calls";

export const inboxItems = pgTable(
  "inbox_items",
  {
    id: serial("id").primaryKey(),
    callId: integer("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    customerPhone: text("customer_phone").notNull(),
    callDate: text("call_date").notNull(),
    resolved: boolean("resolved").notNull().default(false),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedNote: text("resolved_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("inbox_items_call_uq").on(t.callId),
    index("inbox_items_phone_date_idx").on(t.customerPhone, t.callDate),
    index("inbox_items_resolved_idx").on(t.resolved),
  ],
);

export type InboxItem = typeof inboxItems.$inferSelect;
