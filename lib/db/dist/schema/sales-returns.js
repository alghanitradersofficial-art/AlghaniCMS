import { pgTable, serial, text, timestamp, integer, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
// ---------------------------------------------------------------------------
// Sale Returns — customer gives back a product they no longer want
// (not damaged; see claims.ts for the damaged/claim workflow).
//
// Can be linked to a specific invoice (saleId set — partial or full return
// of that invoice's line items) or stand-alone (saleId null — customer +
// product picked directly, e.g. very old sale with no invoice on file).
//
// Effect, always applied atomically in one transaction:
//   - stock: +quantity for every returned item (goes back into inventory)
//   - customer ledger: one "return" entry for -total (reduces what the
//     customer owes us) — only when a customerId is present
//   - if saleId is set: the original invoice's `items`/`subtotal`/`total`
//     are reduced to reflect the return
// ---------------------------------------------------------------------------
export const salesReturnsTable = pgTable("sales_returns", {
    id: serial("id").primaryKey(),
    saleId: integer("sale_id"),
    invoiceNumber: text("invoice_number"),
    customerId: integer("customer_id"),
    customerName: text("customer_name").notNull(),
    items: jsonb("items").notNull().default([]),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    reason: text("reason"),
    notes: text("notes"),
    returnDate: timestamp("return_date", { withTimezone: true }).defaultNow().notNull(),
    createdByUserId: integer("created_by_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertSalesReturnSchema = createInsertSchema(salesReturnsTable).omit({ id: true, createdAt: true });
//# sourceMappingURL=sales-returns.js.map