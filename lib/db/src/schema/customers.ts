import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    phone: text("phone").notNull(),
    name: text("name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("customers_phone_uq").on(t.phone)],
);

export type Customer = typeof customers.$inferSelect;
