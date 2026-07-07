import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers.js";
import { productsTable } from "./products.js";
import { salesTable } from "./sales.js";

// ---------------------------------------------------------------------------
// Customer Price History
// ---------------------------------------------------------------------------
// One row per line-item, per invoice. Written once, at invoice-creation time,
// inside the same DB transaction as the sale itself. Never mutated after the
// fact (edits to an invoice should append a new snapshot via the audit
// trail, not rewrite history) so historical pricing is always trustworthy.
export const priceHistoryTable = pgTable(
  "customer_price_history",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id").notNull().references(() => customersTable.id),
    productId: integer("product_id").notNull().references(() => productsTable.id),
    productName: text("product_name").notNull(),
    sku: text("sku").notNull(),
    saleId: integer("sale_id").references(() => salesTable.id),
    invoiceNumber: text("invoice_number").notNull(),
    invoiceDate: timestamp("invoice_date", { withTimezone: true }).notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    discount: numeric("discount", { precision: 12, scale: 2 }).notNull().default("0"),
    finalPrice: numeric("final_price", { precision: 12, scale: 2 }).notNull(),
    costPrice: numeric("cost_price", { precision: 12, scale: 2 }).notNull(),
    profitAmount: numeric("profit_amount", { precision: 12, scale: 2 }).notNull(),
    profitPercentage: numeric("profit_percentage", { precision: 8, scale: 2 }).notNull(),
    createdByUserId: integer("created_by_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("price_history_customer_product_idx").on(t.customerId, t.productId),
    index("price_history_invoice_idx").on(t.invoiceNumber),
    index("price_history_created_at_idx").on(t.createdAt),
  ],
);

export type PriceHistoryEntry = typeof priceHistoryTable.$inferSelect;
export const insertPriceHistorySchema = createInsertSchema(priceHistoryTable).omit({ id: true, createdAt: true });
export type InsertPriceHistoryEntry = z.infer<typeof insertPriceHistorySchema>;

// ---------------------------------------------------------------------------
// Ledger (Khata) — immutable transaction log with a maintained running balance
// ---------------------------------------------------------------------------
// This is the single source of truth for a customer's balance. Every sale and
// every payment inserts exactly one row here, inside the same DB transaction
// that creates the sale/payment, with `runningBalance` computed from the
// previous row for that customer (locked via `FOR UPDATE` on the customer
// row — see lib/ledger.ts). Balances are NEVER edited directly; corrections
// go in as `adjustment` entries so the audit trail stays intact.
// type: "sale" | "payment" | "adjustment" | "opening_balance"
export const ledgerEntriesTable = pgTable(
  "customer_ledger_entries",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id").notNull().references(() => customersTable.id),
    type: text("type").notNull(),
    // Signed amount: positive increases what the customer owes (a sale),
    // negative decreases it (a payment or a credit adjustment).
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    runningBalance: numeric("running_balance", { precision: 14, scale: 2 }).notNull(),
    saleId: integer("sale_id").references(() => salesTable.id),
    paymentId: integer("payment_id"),
    description: text("description"),
    createdByUserId: integer("created_by_user_id"),
    entryDate: timestamp("entry_date", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("ledger_customer_date_idx").on(t.customerId, t.entryDate),
    index("ledger_customer_id_idx").on(t.customerId, t.id),
  ],
);

export type LedgerEntry = typeof ledgerEntriesTable.$inferSelect;
export const insertLedgerEntrySchema = createInsertSchema(ledgerEntriesTable).omit({ id: true, createdAt: true });
export type InsertLedgerEntry = z.infer<typeof insertLedgerEntrySchema>;

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
// method: "cash" | "bank_transfer" | "cheque" | "jazzcash" | "easypaisa" | "other"
export const paymentsTable = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id").notNull().references(() => customersTable.id),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    method: text("method").notNull().default("cash"),
    bankName: text("bank_name"),
    chequeNumber: text("cheque_number"),
    transactionId: text("transaction_id"),
    reference: text("reference"),
    notes: text("notes"),
    receivedByUserId: integer("received_by_user_id"),
    attachmentUrl: text("attachment_url"),
    // Optional allocation against specific invoices, e.g. [{"saleId":12,"amount":"5000.00"}].
    // When omitted, the payment is applied FIFO against the oldest unpaid invoices.
    allocations: jsonb("allocations").notNull().default([]),
    paymentDate: timestamp("payment_date", { withTimezone: true }).defaultNow().notNull(),
    isVoided: boolean("is_voided").notNull().default(false), // soft delete — never hard-delete financial records
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("payments_customer_idx").on(t.customerId, t.paymentDate),
  ],
);

export type Payment = typeof paymentsTable.$inferSelect;
export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

// ---------------------------------------------------------------------------
// Audit Trail
// ---------------------------------------------------------------------------
// Generic append-only audit log. Used for price changes, invoice edits,
// ledger adjustments, etc. Never deleted.
export const auditLogTable = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    entityType: text("entity_type").notNull(), // e.g. "sale", "sale_item_price", "customer", "payment"
    entityId: integer("entity_id").notNull(),
    action: text("action").notNull(), // e.g. "create", "update", "price_change", "void"
    fieldName: text("field_name"),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    reason: text("reason"),
    performedByUserId: integer("performed_by_user_id"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
  ],
);

export type AuditLogEntry = typeof auditLogTable.$inferSelect;
export const insertAuditLogSchema = createInsertSchema(auditLogTable).omit({ id: true, createdAt: true });
export type InsertAuditLogEntry = z.infer<typeof insertAuditLogSchema>;
