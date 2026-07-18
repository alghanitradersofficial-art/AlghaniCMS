import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  numeric,
  index,
  unique,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { suppliersTable } from "./suppliers.js";
import { productsTable } from "./products.js";

// ---------------------------------------------------------------------------
// Supplier <-> Product mapping. A product can be sourced from multiple
// suppliers; each mapping can carry the supplier's own SKU/name for the same
// item (their naming rarely matches our internal catalog) plus the last cost
// price quoted by that supplier, and whether this is the preferred/default
// supplier for the product.
// ---------------------------------------------------------------------------
export const supplierProductsTable = pgTable(
  "supplier_products",
  {
    id: serial("id").primaryKey(),
    supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id),
    productId: integer("product_id").notNull().references(() => productsTable.id),
    supplierSku: text("supplier_sku"), // supplier's own code for this item
    supplierProductName: text("supplier_product_name"), // supplier's own name for this item
    costPrice: numeric("cost_price", { precision: 12, scale: 2 }),
    isPreferred: boolean("is_preferred").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("supplier_products_supplier_product_unique").on(t.supplierId, t.productId),
    index("supplier_products_supplier_idx").on(t.supplierId),
    index("supplier_products_product_idx").on(t.productId),
  ],
);

export type SupplierProduct = typeof supplierProductsTable.$inferSelect;
export const insertSupplierProductSchema = createInsertSchema(supplierProductsTable).omit({ id: true, createdAt: true });
export type InsertSupplierProduct = z.infer<typeof insertSupplierProductSchema>;

// ---------------------------------------------------------------------------
// Supplier Ledger (Khata) — same immutable-entry + running-balance pattern
// as customer_ledger_entries / supplier_ledger_entries.
// Sign convention: positive = increases what we owe the supplier (a
// purchase). Negative = decreases what we owe (a payment made to them, or a
// return/credit adjustment in our favor).
// type: "purchase" | "payment" | "return" | "adjustment" | "opening_balance"
// ---------------------------------------------------------------------------
export const supplierLedgerEntriesTable = pgTable(
  "supplier_ledger_entries",
  {
    id: serial("id").primaryKey(),
    supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id),
    type: text("type").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    runningBalance: numeric("running_balance", { precision: 14, scale: 2 }).notNull(),
    purchaseId: integer("purchase_id"),
    paymentId: integer("payment_id"),
    description: text("description"),
    createdByUserId: integer("created_by_user_id"),
    entryDate: timestamp("entry_date", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("supplier_ledger_supplier_date_idx").on(t.supplierId, t.entryDate),
    index("supplier_ledger_supplier_id_idx").on(t.supplierId, t.id),
  ],
);

export type SupplierLedgerEntry = typeof supplierLedgerEntriesTable.$inferSelect;
export const insertSupplierLedgerEntrySchema = createInsertSchema(supplierLedgerEntriesTable).omit({ id: true, createdAt: true });
export type InsertSupplierLedgerEntry = z.infer<typeof insertSupplierLedgerEntrySchema>;

// ---------------------------------------------------------------------------
// Supplier Payments — mirrors the customer `payments` table.
// ---------------------------------------------------------------------------
export const supplierPaymentsTable = pgTable(
  "supplier_payments",
  {
    id: serial("id").primaryKey(),
    supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    method: text("method").notNull().default("cash"),
    bankName: text("bank_name"),
    chequeNumber: text("cheque_number"),
    transactionId: text("transaction_id"),
    reference: text("reference"),
    notes: text("notes"),
    paidByUserId: integer("paid_by_user_id"),
    // Which purchase orders this payment was applied against, e.g.
    // [{"purchaseId":12,"poNumber":"PO-123","amount":"5000.00"}]. Recorded so
    // a voided payment can precisely reverse only what it actually paid.
    allocations: jsonb("allocations").notNull().default([]),
    paymentDate: timestamp("payment_date", { withTimezone: true }).defaultNow().notNull(),
    isVoided: boolean("is_voided").notNull().default(false),
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("supplier_payments_supplier_idx").on(t.supplierId, t.paymentDate),
  ],
);

export type SupplierPayment = typeof supplierPaymentsTable.$inferSelect;
export const insertSupplierPaymentSchema = createInsertSchema(supplierPaymentsTable).omit({ id: true, createdAt: true });
export type InsertSupplierPayment = z.infer<typeof insertSupplierPaymentSchema>;
