-- Migration: repair cash_entries table.
-- The previous migration used CREATE TABLE IF NOT EXISTS, which silently did
-- nothing if a cash_entries table already existed with different columns —
-- that's why "column entry_date does not exist" was showing up in production.
-- This migration is idempotent: it creates the table if missing, AND adds
-- any column that isn't there yet, so it converges to the right shape no
-- matter what state the table is currently in.

CREATE TABLE IF NOT EXISTS cash_entries (
  id serial PRIMARY KEY
);

ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cash_entries ALTER COLUMN amount DROP DEFAULT;

ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS entry_date text NOT NULL DEFAULT to_char(NOW(), 'YYYY-MM-DD');
ALTER TABLE cash_entries ALTER COLUMN entry_date DROP DEFAULT;

ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS created_by_user_id integer;
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS cash_entries_entry_date_idx ON cash_entries (entry_date);
