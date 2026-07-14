import { pgTable, serial, integer, timestamp, numeric, boolean, text, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const financialPeriodBalancesTable = pgTable(
  "financial_period_balances",
  {
    id: serial("id").primaryKey(),
    periodId: integer("period_id").notNull(),
    balanceType: text("balance_type").notNull(),
    openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).notNull().default("0"),
    closingBalance: numeric("closing_balance", { precision: 14, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    isCarryForward: boolean("is_carry_forward").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("financial_period_balances_period_idx").on(table.periodId, table.balanceType)],
);

export type FinancialPeriodBalance = typeof financialPeriodBalancesTable.$inferSelect;
export const insertFinancialPeriodBalanceSchema = createInsertSchema(financialPeriodBalancesTable).omit({ id: true, createdAt: true });
export type InsertFinancialPeriodBalance = z.infer<typeof insertFinancialPeriodBalanceSchema>;
