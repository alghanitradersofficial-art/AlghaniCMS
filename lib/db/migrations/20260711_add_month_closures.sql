-- Migration: add month_closures table

CREATE TABLE IF NOT EXISTS month_closures (
  id serial PRIMARY KEY,
  year integer NOT NULL,
  month integer NOT NULL,
  period_start timestamp with time zone NOT NULL,
  period_end timestamp with time zone NOT NULL,
  total_sales numeric(14,2) NOT NULL DEFAULT 0,
  total_purchases numeric(14,2) NOT NULL DEFAULT 0,
  total_expenses numeric(14,2) NOT NULL DEFAULT 0,
  cash_in_hand numeric(14,2) NOT NULL DEFAULT 0,
  closing_stock_value numeric(14,2) NOT NULL DEFAULT 0,
  customer_outstanding numeric(14,2) NOT NULL DEFAULT 0,
  supplier_outstanding numeric(14,2) NOT NULL DEFAULT 0,
  created_by_user_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT NOW(),
  is_locked boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS month_closures_month_idx ON month_closures (year, month);
