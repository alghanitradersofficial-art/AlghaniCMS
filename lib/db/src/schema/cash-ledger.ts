import { pgTable, serial, text, timestamp, numeric, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Cash Ledger — manual cash-in-hand entries.
// ---------------------------------------------------------------------------
// Covers two cases the automatic cash calculation (customer cash payments -
// supplier cash payments - expenses, see months.service.ts computeMonthSummary)
// can't see:
//   1. "opening_balance" — cash on hand before this system was adopted, so
//      historical reports have a correct starting point instead of assuming
//      Rs. 0 at the very beginning.
//   2. "old_entry" / "adjustment" — manually recorded historical cash in/out
//      (old data entry) that wasn't captured through Sales/Payments/Expenses
//      at the time, plus corrections.
// direction: "in" | "out" — sign is applied when computing running balance,
// `amount` itself is always stored positive.
// type: "opening_balance" | "old_entry" | "adjustment"
export const cashLedgerEntriesTable = pgTable(
  "cash_ledger_entries",
  {
    id: serial("id").primaryKey(),
    entryDate: timestamp("entry_date", { withTimezone: true }).notNull(),
    type: text("type").notNull().default("old_entry"),
    direction: text("direction").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    note: text("note"),
    createdByUserId: integer("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("cash_ledger_entries_date_idx").on(t.entryDate),
  ],
);

export type CashLedgerEntry = typeof cashLedgerEntriesTable.$inferSelect;
export const insertCashLedgerEntrySchema = createInsertSchema(cashLedgerEntriesTable).omit({ id: true, createdAt: true });
export type InsertCashLedgerEntry = z.infer<typeof insertCashLedgerEntrySchema>;
