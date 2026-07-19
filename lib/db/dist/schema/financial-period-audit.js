import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
export const financialPeriodAuditLogsTable = pgTable("financial_period_audit_logs", {
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
}, (table) => [index("financial_period_audit_logs_period_idx").on(table.periodId, table.createdAt)]);
export const insertFinancialPeriodAuditLogSchema = createInsertSchema(financialPeriodAuditLogsTable).omit({ id: true, createdAt: true });
//# sourceMappingURL=financial-period-audit.js.map