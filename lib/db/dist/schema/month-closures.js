import { pgTable, serial, integer, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
export const monthClosuresTable = pgTable("month_closures", {
    id: serial("id").primaryKey(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    totalSales: numeric("total_sales", { precision: 14, scale: 2 }).notNull().default("0"),
    totalPurchases: numeric("total_purchases", { precision: 14, scale: 2 }).notNull().default("0"),
    totalExpenses: numeric("total_expenses", { precision: 14, scale: 2 }).notNull().default("0"),
    cashInHand: numeric("cash_in_hand", { precision: 14, scale: 2 }).notNull().default("0"),
    closingStockValue: numeric("closing_stock_value", { precision: 14, scale: 2 }).notNull().default("0"),
    customerOutstanding: numeric("customer_outstanding", { precision: 14, scale: 2 }).notNull().default("0"),
    supplierOutstanding: numeric("supplier_outstanding", { precision: 14, scale: 2 }).notNull().default("0"),
    createdByUserId: integer("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    isLocked: boolean("is_locked").notNull().default(false),
});
export const insertMonthClosureSchema = createInsertSchema(monthClosuresTable).omit({ id: true, createdAt: true });
//# sourceMappingURL=month-closures.js.map