import { pgTable, serial, text, timestamp, integer, numeric, index, } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
// ---------------------------------------------------------------------------
// General Ledger — a read-oriented, cross-module transaction feed.
//
// IMPORTANT: this is intentionally a SEPARATE table from
// `customer_ledger_entries` (lib/db/src/schema/ledger.ts). That table is
// load-bearing for per-customer running balances and invoice payment
// allocation (row-locking, FIFO) and must not be restructured. This table
// does not replace it — it's a denormalized append-only feed that every
// money-moving module writes ONE row to (in addition to whatever
// module-specific ledger it already writes to), purely so the Dashboard,
// Calendar view, and a global "Ledger" report page can show one unified,
// filterable, date-ranged timeline across sales, purchases, expenses,
// supplier payments, and customer payments without having to UNION multiple
// different tables with different shapes on every request.
//
// type: "sale" | "purchase" | "expense" | "supplier_payment" |
//       "customer_payment" | "adjustment"
// partyType: "customer" | "supplier" | "none"
// direction: "credit" | "debit" (from the business's point of view —
//   credit = money in / receivable increases; debit = money out / payable increases)
// ---------------------------------------------------------------------------
export const generalLedgerEntriesTable = pgTable("general_ledger_entries", {
    id: serial("id").primaryKey(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    type: text("type").notNull(),
    referenceId: integer("reference_id"), // FK to the source record (sale id, purchase id, etc.) — not enforced, source table varies by type
    partyType: text("party_type").notNull().default("none"),
    partyId: integer("party_id"),
    partyName: text("party_name"), // denormalized for fast display without joins
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    direction: text("direction").notNull(),
    note: text("note"),
    createdByUserId: integer("created_by_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
    index("general_ledger_date_idx").on(t.date),
    index("general_ledger_type_idx").on(t.type, t.date),
    index("general_ledger_party_idx").on(t.partyType, t.partyId, t.date),
]);
export const insertGeneralLedgerEntrySchema = createInsertSchema(generalLedgerEntriesTable).omit({ id: true, createdAt: true });
//# sourceMappingURL=general-ledger.js.map