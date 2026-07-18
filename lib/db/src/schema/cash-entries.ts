import { pgTable, serial, text, timestamp, numeric, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Cash Entries — manual "cash in hand" bookkeeping.
//
// This is intentionally NOT derived from sales/purchases/expenses or the
// general ledger. It exists so the daily cash-in-hand amount can be entered
// by hand (e.g. from a physical cash count at end of day) instead of being
// auto-calculated from other modules. One row = one manual entry for a
// given day.
// ---------------------------------------------------------------------------
export const cashEntriesTable = pgTable(
  "cash_entries",
  {
    id: serial("id").primaryKey(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    entryDate: text("entry_date").notNull(), // YYYY-MM-DD — the day this cash entry belongs to
    note: text("note"),
    createdByUserId: integer("created_by_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("cash_entries_entry_date_idx").on(t.entryDate)],
);

export type CashEntry = typeof cashEntriesTable.$inferSelect;
export const insertCashEntrySchema = createInsertSchema(cashEntriesTable).omit({ id: true, createdAt: true });
export type InsertCashEntry = z.infer<typeof insertCashEntrySchema>;
