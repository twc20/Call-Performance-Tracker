import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const stores = pgTable(
  "stores",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    brand: text("brand"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("stores_name_uq").on(t.name)],
);

export type Store = typeof stores.$inferSelect;
