import { pgTable, serial, integer, text, timestamp, numeric, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
export const financialPeriodsTable = pgTable("financial_periods", {
    id: serial("id").primaryKey(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    status: text("status").notNull().default("open"),
    openingCash: numeric("opening_cash", { precision: 14, scale: 2 }).notNull().default("0"),
    openingStockValue: numeric("opening_stock_value", { precision: 14, scale: 2 }).notNull().default("0"),
    openingStockQuantity: numeric("opening_stock_quantity", { precision: 14, scale: 2 }).notNull().default("0"),
    openingCustomerBalance: numeric("opening_customer_balance", { precision: 14, scale: 2 }).notNull().default("0"),
    openingSupplierBalance: numeric("opening_supplier_balance", { precision: 14, scale: 2 }).notNull().default("0"),
    closingCash: numeric("closing_cash", { precision: 14, scale: 2 }).notNull().default("0"),
    closingStockValue: numeric("closing_stock_value", { precision: 14, scale: 2 }).notNull().default("0"),
    closingStockQuantity: numeric("closing_stock_quantity", { precision: 14, scale: 2 }).notNull().default("0"),
    closingCustomerBalance: numeric("closing_customer_balance", { precision: 14, scale: 2 }).notNull().default("0"),
    closingSupplierBalance: numeric("closing_supplier_balance", { precision: 14, scale: 2 }).notNull().default("0"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedByUserId: integer("closed_by_user_id"),
    updatedAfterClosing: boolean("updated_after_closing").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("financial_periods_year_month_idx").on(table.year, table.month)]);
export const insertFinancialPeriodSchema = createInsertSchema(financialPeriodsTable).omit({ id: true, createdAt: true, updatedAt: true });
//# sourceMappingURL=financial-periods.js.map