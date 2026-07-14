import { pgTable, serial, varchar, text, numeric, timestamp } from 'drizzle-orm/pg-core';

export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }).notNull(),
  email: varchar('email', { length: 255 }),
  address: text('address'),
  city: varchar('city', { length: 100 }),
  type: varchar('type', { length: 50 }).notNull().default('retail'),
  openingBalance: numeric('opening_balance', { precision: 12, scale: 2 }).notNull().default('0'),
  currentBalance: numeric('current_balance', { precision: 12, scale: 2 }).notNull().default('0'),
  totalOrders: integer('total_orders').notNull().default(0),
  totalSpent: numeric('total_spent', { precision: 12, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

import { integer } from 'drizzle-orm/pg-core';

export const customerLedger = pgTable('customer_ledger', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').notNull().references(() => customers.id),
  type: varchar('type', { length: 20 }).notNull(), // debit | credit | opening
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  balance: numeric('balance', { precision: 12, scale: 2 }).notNull(),
  description: text('description'),
  refId: integer('ref_id'),
  refType: varchar('ref_type', { length: 50 }), // sale | payment | adjustment
  entryDate: timestamp('entry_date').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
