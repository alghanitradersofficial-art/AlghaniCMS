import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
export const stockAdjustmentsTable = pgTable("stock_adjustments", {
    id: serial("id").primaryKey(),
    productId: integer("product_id").notNull(),
    direction: text("direction").notNull(),
    quantity: integer("quantity").notNull(),
    reason: text("reason").notNull(),
    notes: text("notes"),
    createdByUserId: integer("created_by_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertStockAdjustmentSchema = createInsertSchema(stockAdjustmentsTable).omit({ id: true, createdAt: true });
//# sourceMappingURL=stock-adjustments.js.map