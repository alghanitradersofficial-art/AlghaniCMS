import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
export const categoriesTable = pgTable("categories", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertCategorySchema = createInsertSchema(categoriesTable).omit({ id: true, createdAt: true });
//# sourceMappingURL=categories.js.map