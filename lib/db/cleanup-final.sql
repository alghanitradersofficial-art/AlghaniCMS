-- ============================================
-- DATABASE CLEANUP - COMPLETE & RELIABLE
-- ============================================
-- Removes ALL dummy data from tables
-- KEEPS table structure intact (tables not deleted)
-- PRESERVES: users, audit_log tables
-- 
-- Run this in Neon SQL Editor
-- Copy entire script and paste at once
-- ============================================

-- Step 1: Disable all triggers temporarily
ALTER TABLE financial_period_audit DISABLE TRIGGER ALL;
ALTER TABLE financial_period_balances DISABLE TRIGGER ALL;
ALTER TABLE financial_period_snapshots DISABLE TRIGGER ALL;
ALTER TABLE month_closures DISABLE TRIGGER ALL;
ALTER TABLE financial_periods DISABLE TRIGGER ALL;
ALTER TABLE stock_adjustments DISABLE TRIGGER ALL;
ALTER TABLE reminders DISABLE TRIGGER ALL;
ALTER TABLE notifications DISABLE TRIGGER ALL;
ALTER TABLE price_history DISABLE TRIGGER ALL;
ALTER TABLE supplier_ledger_entries DISABLE TRIGGER ALL;
ALTER TABLE ledger_entries DISABLE TRIGGER ALL;
ALTER TABLE general_ledger_entries DISABLE TRIGGER ALL;
ALTER TABLE expenses DISABLE TRIGGER ALL;
ALTER TABLE purchases DISABLE TRIGGER ALL;
ALTER TABLE sales DISABLE TRIGGER ALL;
ALTER TABLE supplier_products DISABLE TRIGGER ALL;
ALTER TABLE suppliers DISABLE TRIGGER ALL;
ALTER TABLE customers DISABLE TRIGGER ALL;
ALTER TABLE products DISABLE TRIGGER ALL;
ALTER TABLE categories DISABLE TRIGGER ALL;
ALTER TABLE brands DISABLE TRIGGER ALL;

-- Step 2: Disable foreign key constraint checks
SET session_replication_role = 'replica';

-- Step 3: Clear all tables (keep structure, remove data only)
DELETE FROM financial_period_audit;
DELETE FROM financial_period_balances;
DELETE FROM financial_period_snapshots;
DELETE FROM month_closures;
DELETE FROM financial_periods;
DELETE FROM stock_adjustments;
DELETE FROM reminders;
DELETE FROM notifications;
DELETE FROM price_history;
DELETE FROM supplier_ledger_entries;
DELETE FROM ledger_entries;
DELETE FROM general_ledger_entries;
DELETE FROM expenses;
DELETE FROM purchases;
DELETE FROM sales;
DELETE FROM supplier_products;
DELETE FROM suppliers;
DELETE FROM customers;
DELETE FROM products;
DELETE FROM categories;
DELETE FROM brands;

-- Step 4: Re-enable foreign key checks
SET session_replication_role = 'origin';

-- Step 5: Re-enable all triggers
ALTER TABLE financial_period_audit ENABLE TRIGGER ALL;
ALTER TABLE financial_period_balances ENABLE TRIGGER ALL;
ALTER TABLE financial_period_snapshots ENABLE TRIGGER ALL;
ALTER TABLE month_closures ENABLE TRIGGER ALL;
ALTER TABLE financial_periods ENABLE TRIGGER ALL;
ALTER TABLE stock_adjustments ENABLE TRIGGER ALL;
ALTER TABLE reminders ENABLE TRIGGER ALL;
ALTER TABLE notifications ENABLE TRIGGER ALL;
ALTER TABLE price_history ENABLE TRIGGER ALL;
ALTER TABLE supplier_ledger_entries ENABLE TRIGGER ALL;
ALTER TABLE ledger_entries ENABLE TRIGGER ALL;
ALTER TABLE general_ledger_entries ENABLE TRIGGER ALL;
ALTER TABLE expenses ENABLE TRIGGER ALL;
ALTER TABLE purchases ENABLE TRIGGER ALL;
ALTER TABLE sales ENABLE TRIGGER ALL;
ALTER TABLE supplier_products ENABLE TRIGGER ALL;
ALTER TABLE suppliers ENABLE TRIGGER ALL;
ALTER TABLE customers ENABLE TRIGGER ALL;
ALTER TABLE products ENABLE TRIGGER ALL;
ALTER TABLE categories ENABLE TRIGGER ALL;
ALTER TABLE brands ENABLE TRIGGER ALL;

-- Step 6: Reset sequences (for auto-increment IDs)
ALTER SEQUENCE brands_id_seq RESTART WITH 1;
ALTER SEQUENCE categories_id_seq RESTART WITH 1;
ALTER SEQUENCE products_id_seq RESTART WITH 1;
ALTER SEQUENCE customers_id_seq RESTART WITH 1;
ALTER SEQUENCE suppliers_id_seq RESTART WITH 1;
ALTER SEQUENCE sales_id_seq RESTART WITH 1;
ALTER SEQUENCE purchases_id_seq RESTART WITH 1;
ALTER SEQUENCE expenses_id_seq RESTART WITH 1;
ALTER SEQUENCE notifications_id_seq RESTART WITH 1;
ALTER SEQUENCE reminders_id_seq RESTART WITH 1;
ALTER SEQUENCE stock_adjustments_id_seq RESTART WITH 1;
ALTER SEQUENCE supplier_products_id_seq RESTART WITH 1;
ALTER SEQUENCE ledger_entries_id_seq RESTART WITH 1;
ALTER SEQUENCE general_ledger_entries_id_seq RESTART WITH 1;
ALTER SEQUENCE price_history_id_seq RESTART WITH 1;
ALTER SEQUENCE supplier_ledger_entries_id_seq RESTART WITH 1;
ALTER SEQUENCE financial_periods_id_seq RESTART WITH 1;
ALTER SEQUENCE financial_period_snapshots_id_seq RESTART WITH 1;
ALTER SEQUENCE financial_period_balances_id_seq RESTART WITH 1;
ALTER SEQUENCE financial_period_audit_id_seq RESTART WITH 1;
ALTER SEQUENCE month_closures_id_seq RESTART WITH 1;

-- Cleanup complete!
SELECT 'SUCCESS: All test data removed! Tables structure preserved. Users & audit_log kept.' as cleanup_status;
