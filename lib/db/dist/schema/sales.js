import { pgTable, serial, text, timestamp, integer, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
export const salesTable = pgTable("sales", {
    id: serial("id").primaryKey(),
    invoiceNumber: text("invoice_number").notNull().unique(),
    customerId: integer("customer_id"),
    customerName: text("customer_name").notNull(),
    status: text("status").notNull().default("completed"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
    discount: numeric("discount", { precision: 12, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    // Cumulative amount allocated from payments against this invoice (Khata module).
    // total - amountPaid = outstanding balance for this specific invoice.
    amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    items: jsonb("items").notNull().default([]),
    // Editable invoice date, defaults to now but can be set to any past date
    // for backdated/historical entry. createdAt always reflects when the row
    // was actually inserted and is never user-editable.
    saleDate: timestamp("sale_date", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertSaleSchema = createInsertSchema(salesTable).omit({ id: true, createdAt: true });
//# sourceMappingURL=sales.js.map