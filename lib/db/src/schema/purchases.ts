import { pgTable, serial, text, timestamp, integer, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const purchasesTable = pgTable("purchases", {
  id: serial("id").primaryKey(),
  poNumber: text("po_number").notNull().unique(),
  supplierId: integer("supplier_id"),
  supplierName: text("supplier_name").notNull(),
  status: text("status").notNull().default("received"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  total: numeric("total", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
  items: jsonb("items").notNull().default([]),
  // Editable PO/purchase date for backdated/historical entry (see sales.saleDate).
  purchaseDate: timestamp("purchase_date", { withTimezone: true }).defaultNow().notNull(),
  // Cumulative amount paid to the supplier against this purchase order.
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPurchaseSchema = createInsertSchema(purchasesTable).omit({ id: true, createdAt: true });
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type Purchase = typeof purchasesTable.$inferSelect;
