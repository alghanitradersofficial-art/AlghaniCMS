-- Migration: add cash_entries table for manual daily cash-in-hand tracking.
-- This is independent of sales/purchases/expenses/general_ledger — it exists
-- purely so daily cash can be entered by hand instead of auto-calculated.

CREATE TABLE IF NOT EXISTS cash_entries (
  id serial PRIMARY KEY,
  amount numeric(12,2) NOT NULL,
  entry_date text NOT NULL,
  note text,
  created_by_user_id integer,
  created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cash_entries_entry_date_idx ON cash_entries (entry_date);
