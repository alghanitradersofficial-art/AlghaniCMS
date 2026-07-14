import { pgTable, serial, varchar, text, numeric, integer, timestamp } from 'drizzle-orm/pg-core';

export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }).notNull(),
  email: varchar('email', { length: 255 }),
  address: text('address'),
  city: varchar('city', { length: 100 }),
  openingBalance: numeric('opening_balance', { precision: 12, scale: 2 }).notNull().default('0'),
  currentBalance: numeric('current_balance', { precision: 12, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const supplierLedger = pgTable('supplier_ledger', {
  id: serial('id').primaryKey(),
  supplierId: integer('supplier_id').notNull().references(() => suppliers.id),
  type: varchar('type', { length: 20 }).notNull(), // debit | credit | opening
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  balance: numeric('balance', { precision: 12, scale: 2 }).notNull(),
  description: text('description'),
  refId: integer('ref_id'),
  refType: varchar('ref_type', { length: 50 }), // purchase | payment | adjustment
  entryDate: timestamp('entry_date').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
