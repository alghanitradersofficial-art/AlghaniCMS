import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
// ---------------------------------------------------------------------------
// Claims — full lifecycle for a damaged/defective product a customer hands
// back to us, which we then send to the supplier and eventually resolve.
//
// Lifecycle (status column), each transition moves real stock:
//   1. with_us            — received from customer. stock -1 (unit leaves
//                            saleable inventory), customer ledger -amount
//                            (same as a return — the customer isn't charged
//                            for the damaged unit anymore).
//   2. sent_to_supplier    — handed off to the supplier for resolution.
//                            No stock/ledger change; tracking only.
//   3a. resolved_replacement — supplier sent a replacement unit back.
//                              stock +1. No supplier-ledger impact (a
//                              like-for-like physical swap has no financial
//                              effect).
//   3b. resolved_credit      — supplier issued credit/refund instead of a
//                              replacement. supplier ledger -amount (reduces
//                              what we owe them). No further stock movement.
//   4. returned_to_customer  — (only reachable from resolved_replacement)
//                              the replacement unit is handed to the
//                              customer. stock -1 again.
// ---------------------------------------------------------------------------
export const claimsTable = pgTable("claims", {
    id: serial("id").primaryKey(),
    saleId: integer("sale_id"),
    invoiceNumber: text("invoice_number"),
    customerId: integer("customer_id"),
    customerName: text("customer_name").notNull(),
    productId: integer("product_id").notNull(),
    productName: text("product_name").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
    totalValue: numeric("total_value", { precision: 12, scale: 2 }).notNull().default("0"),
    supplierId: integer("supplier_id"),
    supplierName: text("supplier_name"),
    status: text("status").notNull().default("with_us"),
    resolutionType: text("resolution_type"),
    reason: text("reason"),
    notes: text("notes"),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    sentToSupplierAt: timestamp("sent_to_supplier_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    returnedToCustomerAt: timestamp("returned_to_customer_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertClaimSchema = createInsertSchema(claimsTable).omit({ id: true, createdAt: true });
//# sourceMappingURL=claims.js.map