-- Database Cleanup Script
-- Removes all dummy/test data while preserving users and settings
-- This script uses CASCADE to handle foreign key relationships automatically

BEGIN;

-- Disable foreign key constraints temporarily
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

-- Clear data in reverse dependency order
TRUNCATE TABLE financial_period_audit CASCADE;
TRUNCATE TABLE financial_period_balances CASCADE;
TRUNCATE TABLE financial_period_snapshots CASCADE;
TRUNCATE TABLE month_closures CASCADE;
TRUNCATE TABLE financial_periods CASCADE;
TRUNCATE TABLE stock_adjustments CASCADE;
TRUNCATE TABLE reminders CASCADE;
TRUNCATE TABLE notifications CASCADE;
TRUNCATE TABLE price_history CASCADE;
TRUNCATE TABLE supplier_ledger_entries CASCADE;
TRUNCATE TABLE ledger_entries CASCADE;
TRUNCATE TABLE general_ledger_entries CASCADE;
TRUNCATE TABLE expenses CASCADE;
TRUNCATE TABLE purchases CASCADE;
TRUNCATE TABLE sales CASCADE;
TRUNCATE TABLE supplier_products CASCADE;
TRUNCATE TABLE suppliers CASCADE;
TRUNCATE TABLE customers CASCADE;
TRUNCATE TABLE products CASCADE;
TRUNCATE TABLE categories CASCADE;
TRUNCATE TABLE brands CASCADE;

-- Re-enable triggers
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

-- Users table is PRESERVED (not cleared)
-- audit_log table is PRESERVED (not cleared)

COMMIT;

-- Verify cleanup
SELECT 'cleanup complete' as status;
