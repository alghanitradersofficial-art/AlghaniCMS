import { pgTable, serial, integer, varchar, text, boolean, timestamp, numeric } from 'drizzle-orm/pg-core';

export const monthClosures = pgTable('month_closures', {
  id: serial('id').primaryKey(),
  year: integer('year').notNull(),
  month: integer('month').notNull(), // 1-12
  status: varchar('status', { length: 20 }).notNull().default('open'), // open | closed
  closedAt: timestamp('closed_at'),
  closedBy: varchar('closed_by', { length: 255 }),
  reopenedAt: timestamp('reopened_at'),
  reopenedBy: varchar('reopened_by', { length: 255 }),
  totalSales: numeric('total_sales', { precision: 14, scale: 2 }).notNull().default('0'),
  totalPurchases: numeric('total_purchases', { precision: 14, scale: 2 }).notNull().default('0'),
  totalExpenses: numeric('total_expenses', { precision: 14, scale: 2 }).notNull().default('0'),
  grossProfit: numeric('gross_profit', { precision: 14, scale: 2 }).notNull().default('0'),
  netProfit: numeric('net_profit', { precision: 14, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const yearClosures = pgTable('year_closures', {
  id: serial('id').primaryKey(),
  year: integer('year').notNull().unique(),
  status: varchar('status', { length: 20 }).notNull().default('open'),
  closedAt: timestamp('closed_at'),
  closedBy: varchar('closed_by', { length: 255 }),
  reopenedAt: timestamp('reopened_at'),
  reopenedBy: varchar('reopened_by', { length: 255 }),
  totalSales: numeric('total_sales', { precision: 14, scale: 2 }).notNull().default('0'),
  totalPurchases: numeric('total_purchases', { precision: 14, scale: 2 }).notNull().default('0'),
  totalExpenses: numeric('total_expenses', { precision: 14, scale: 2 }).notNull().default('0'),
  netProfit: numeric('net_profit', { precision: 14, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
