import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
export const productsTable = pgTable("products", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    sku: text("sku").notNull().unique(),
    description: text("description"),
    categoryId: integer("category_id"),
    brandId: integer("brand_id"),
    costPrice: numeric("cost_price", { precision: 12, scale: 2 }).notNull(),
    salePrice: numeric("sale_price", { precision: 12, scale: 2 }).notNull(),
    currentStock: integer("current_stock").notNull().default(0),
    minStock: integer("min_stock").notNull().default(5),
    unit: text("unit").notNull().default("pcs"),
    oemNumber: text("oem_number"),
    barcode: text("barcode"),
    imageUrl: text("image_url"),
    imagePublicId: text("image_public_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true });
//# sourceMappingURL=products.js.map