import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const financialPeriodAuditLogsTable = pgTable(
  "financial_period_audit_logs",
  {
    id: serial("id").primaryKey(),
    periodId: integer("period_id").notNull(),
    entityType: text("entity_type").notNull(),
    action: text("action").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    reason: text("reason"),
    performedByUserId: integer("performed_by_user_id"),
    ipAddress: text("ip_address"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("financial_period_audit_logs_period_idx").on(table.periodId, table.createdAt)],
);

export type FinancialPeriodAuditLog = typeof financialPeriodAuditLogsTable.$inferSelect;
export const insertFinancialPeriodAuditLogSchema = createInsertSchema(financialPeriodAuditLogsTable).omit({ id: true, createdAt: true });
export type InsertFinancialPeriodAuditLog = z.infer<typeof insertFinancialPeriodAuditLogSchema>;
