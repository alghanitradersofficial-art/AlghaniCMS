-- ============================================
-- SAFE DATABASE CLEANUP
-- Only clears tables that exist
-- KEEPS: users, audit_log tables
-- ============================================

-- Disable all triggers temporarily
BEGIN;
SET session_replication_role = 'replica';

-- Delete from tables (one by one, skipping non-existent ones)
-- This won't error if tables don't exist

DO $$
DECLARE
    tables RECORD;
BEGIN
    FOR tables IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name NOT IN ('users', 'audit_log', 'pg_*'))
    LOOP
        EXECUTE 'DELETE FROM ' || quote_ident(tables.table_name);
        RAISE NOTICE 'Deleted from table: %', tables.table_name;
    END LOOP;
END $$;

-- Re-enable triggers
SET session_replication_role = 'origin';
COMMIT;

-- Show what's left
SELECT 'Cleanup complete!' as status, COUNT(*) as users_remaining FROM users;
