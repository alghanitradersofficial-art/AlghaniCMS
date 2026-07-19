import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
export const brandsTable = pgTable("brands", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertBrandSchema = createInsertSchema(brandsTable).omit({ id: true, createdAt: true });
//# sourceMappingURL=brands.js.map