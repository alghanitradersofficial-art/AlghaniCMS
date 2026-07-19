import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
export const financialPeriodSnapshotsTable = pgTable("financial_period_snapshots", {
    id: serial("id").primaryKey(),
    periodId: integer("period_id").notNull(),
    snapshotType: text("snapshot_type").notNull().default("monthly"),
    summary: jsonb("summary").notNull().default({}),
    salesSummary: jsonb("sales_summary").notNull().default({}),
    purchaseSummary: jsonb("purchase_summary").notNull().default({}),
    profitSummary: jsonb("profit_summary").notNull().default({}),
    inventorySummary: jsonb("inventory_summary").notNull().default({}),
    customerSummary: jsonb("customer_summary").notNull().default({}),
    supplierSummary: jsonb("supplier_summary").notNull().default({}),
    cashSummary: jsonb("cash_summary").notNull().default({}),
    topProducts: jsonb("top_products").notNull().default([]),
    topCustomers: jsonb("top_customers").notNull().default([]),
    topSuppliers: jsonb("top_suppliers").notNull().default([]),
    kpiSummary: jsonb("kpi_summary").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("financial_period_snapshots_period_idx").on(table.periodId, table.createdAt)]);
export const insertFinancialPeriodSnapshotSchema = createInsertSchema(financialPeriodSnapshotsTable).omit({ id: true, createdAt: true });
//# sourceMappingURL=financial-period-snapshots.js.map