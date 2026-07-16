-- Migration: add cash_ledger_entries table
-- Manual/historical cash-in-hand entries (opening balance, old data entry,
-- adjustments) that feed into the Cash in Hand report alongside cash
-- payments, cash supplier payments, and expenses.

CREATE TABLE IF NOT EXISTS cash_ledger_entries (
  id serial PRIMARY KEY,
  entry_date timestamp with time zone NOT NULL,
  type text NOT NULL DEFAULT 'old_entry',
  direction text NOT NULL,
  amount numeric(14,2) NOT NULL,
  note text,
  created_by_user_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cash_ledger_entries_date_idx ON cash_ledger_entries (entry_date);
