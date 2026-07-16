-- Migration: enforce uniqueness on financial_periods (year, month)
-- Fixes a bug where closeMonth() could insert a duplicate row for a period that
-- already existed, causing status lookups to non-deterministically return the
-- wrong (stale "open") row after closing a month.

-- Dedupe existing duplicates first: prefer closed status, then most recently updated.
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY year, month
      ORDER BY (status = 'closed') DESC, updated_at DESC, id DESC
    ) AS rn
  FROM financial_periods
)
DELETE FROM financial_periods
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

DO $$
BEGIN
  ALTER TABLE financial_periods
    ADD CONSTRAINT financial_periods_year_month_unique UNIQUE (year, month);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
