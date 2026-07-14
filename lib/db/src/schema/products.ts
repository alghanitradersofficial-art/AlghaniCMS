import { pgTable, serial, varchar, text, numeric, integer, timestamp } from 'drizzle-orm/pg-core';

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const brands = pgTable('brands', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 100 }).notNull().unique(),
  description: text('description'),
  categoryId: integer('category_id').references(() => categories.id),
  brandId: integer('brand_id').references(() => brands.id),
  costPrice: numeric('cost_price', { precision: 12, scale: 2 }).notNull().default('0'),
  salePrice: numeric('sale_price', { precision: 12, scale: 2 }).notNull().default('0'),
  currentStock: numeric('current_stock', { precision: 12, scale: 3 }).notNull().default('0'),
  minStock: numeric('min_stock', { precision: 12, scale: 3 }).notNull().default('0'),
  unit: varchar('unit', { length: 50 }).notNull().default('pcs'),
  oemNumber: varchar('oem_number', { length: 100 }),
  barcode: varchar('barcode', { length: 100 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
