import bcrypt from "bcryptjs";
import { pool } from "@workspace/db";
import { logger } from "./logger.js";

export async function initializeDatabase() {
  if (!pool) {
    logger.warn("Database is not configured; skipping schema initialization.");
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS company_settings (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        updated_at timestamp with time zone NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS report_schedules (
        id serial PRIMARY KEY,
        report_type text NOT NULL,
        frequency text NOT NULL,
        send_to jsonb NOT NULL DEFAULT '[]'::jsonb,
        whatsapp_numbers jsonb NOT NULL DEFAULT '[]'::jsonb,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamp with time zone NOT NULL DEFAULT NOW()
      );

      ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url text;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS image_public_id text;

      -- Customer Price History + Khata (Ledger) module
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS opening_balance numeric(14, 2) NOT NULL DEFAULT 0;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit numeric(14, 2) NOT NULL DEFAULT 0;
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS amount_paid numeric(12, 2) NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS customer_price_history (
        id serial PRIMARY KEY,
        customer_id integer NOT NULL REFERENCES customers(id),
        product_id integer NOT NULL REFERENCES products(id),
        product_name text NOT NULL,
        sku text NOT NULL,
        sale_id integer REFERENCES sales(id),
        invoice_number text NOT NULL,
        invoice_date timestamp with time zone NOT NULL,
        quantity numeric(12, 2) NOT NULL,
        unit_price numeric(12, 2) NOT NULL,
        discount numeric(12, 2) NOT NULL DEFAULT 0,
        final_price numeric(12, 2) NOT NULL,
        cost_price numeric(12, 2) NOT NULL,
        profit_amount numeric(12, 2) NOT NULL,
        profit_percentage numeric(8, 2) NOT NULL,
        created_by_user_id integer,
        created_at timestamp with time zone NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS price_history_customer_product_idx ON customer_price_history (customer_id, product_id);
      CREATE INDEX IF NOT EXISTS price_history_invoice_idx ON customer_price_history (invoice_number);
      CREATE INDEX IF NOT EXISTS price_history_created_at_idx ON customer_price_history (created_at);

      CREATE TABLE IF NOT EXISTS customer_ledger_entries (
        id serial PRIMARY KEY,
        customer_id integer NOT NULL REFERENCES customers(id),
        type text NOT NULL,
        amount numeric(14, 2) NOT NULL,
        running_balance numeric(14, 2) NOT NULL,
        sale_id integer REFERENCES sales(id),
        payment_id integer,
        description text,
        created_by_user_id integer,
        entry_date timestamp with time zone NOT NULL DEFAULT NOW(),
        created_at timestamp with time zone NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ledger_customer_date_idx ON customer_ledger_entries (customer_id, entry_date);
      CREATE INDEX IF NOT EXISTS ledger_customer_id_idx ON customer_ledger_entries (customer_id, id);

      CREATE TABLE IF NOT EXISTS payments (
        id serial PRIMARY KEY,
        customer_id integer NOT NULL REFERENCES customers(id),
        amount numeric(14, 2) NOT NULL,
        method text NOT NULL DEFAULT 'cash',
        bank_name text,
        cheque_number text,
        transaction_id text,
        reference text,
        notes text,
        received_by_user_id integer,
        attachment_url text,
        allocations jsonb NOT NULL DEFAULT '[]'::jsonb,
        payment_date timestamp with time zone NOT NULL DEFAULT NOW(),
        is_voided boolean NOT NULL DEFAULT false,
        void_reason text,
        created_at timestamp with time zone NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS payments_customer_idx ON payments (customer_id, payment_date);

      CREATE TABLE IF NOT EXISTS audit_log (
        id serial PRIMARY KEY,
        entity_type text NOT NULL,
        entity_id integer NOT NULL,
        action text NOT NULL,
        field_name text,
        old_value text,
        new_value text,
        reason text,
        performed_by_user_id integer,
        ip_address text,
        created_at timestamp with time zone NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log (entity_type, entity_id);

      CREATE TABLE IF NOT EXISTS user_sessions (
        id serial PRIMARY KEY,
        user_id integer NOT NULL,
        token_hash text NOT NULL,
        refresh_token_hash text NOT NULL,
        user_agent text,
        ip_address text,
        created_at timestamp with time zone NOT NULL DEFAULT NOW(),
        last_seen_at timestamp with time zone NOT NULL DEFAULT NOW(),
        expires_at timestamp with time zone NOT NULL DEFAULT NOW() + INTERVAL '30 days'
      );
      CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions (user_id, expires_at);

      -- Suppliers: contact person / notes / opening balance (Khata)
      ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_person text;
      ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS notes text;
      ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS opening_balance numeric(14, 2) NOT NULL DEFAULT 0;

      -- Supplier products / aliases
      CREATE TABLE IF NOT EXISTS supplier_products (
        id serial PRIMARY KEY,
        supplier_id integer NOT NULL REFERENCES suppliers(id),
        product_id integer NOT NULL REFERENCES products(id),
        supplier_sku text,
        supplier_product_name text,
        cost_price numeric(12, 2),
        is_preferred boolean NOT NULL DEFAULT false,
        notes text,
        created_at timestamp with time zone NOT NULL DEFAULT NOW(),
        CONSTRAINT supplier_products_supplier_product_unique UNIQUE (supplier_id, product_id)
      );
      CREATE INDEX IF NOT EXISTS supplier_products_supplier_idx ON supplier_products (supplier_id);
      CREATE INDEX IF NOT EXISTS supplier_products_product_idx ON supplier_products (product_id);

      -- Supplier ledger (Khata)
      CREATE TABLE IF NOT EXISTS supplier_ledger_entries (
        id serial PRIMARY KEY,
        supplier_id integer NOT NULL REFERENCES suppliers(id),
        type text NOT NULL,
        amount numeric(14, 2) NOT NULL,
        running_balance numeric(14, 2) NOT NULL,
        purchase_id integer,
        payment_id integer,
        description text,
        created_by_user_id integer,
        entry_date timestamp with time zone NOT NULL DEFAULT NOW(),
        created_at timestamp with time zone NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS supplier_ledger_supplier_date_idx ON supplier_ledger_entries (supplier_id, entry_date);
      CREATE INDEX IF NOT EXISTS supplier_ledger_supplier_id_idx ON supplier_ledger_entries (supplier_id, id);

      CREATE TABLE IF NOT EXISTS supplier_payments (
        id serial PRIMARY KEY,
        supplier_id integer NOT NULL REFERENCES suppliers(id),
        amount numeric(14, 2) NOT NULL,
        method text NOT NULL DEFAULT 'cash',
        bank_name text,
        cheque_number text,
        transaction_id text,
        reference text,
        notes text,
        allocations jsonb NOT NULL DEFAULT '[]'::jsonb,
        paid_by_user_id integer,
        payment_date timestamp with time zone NOT NULL DEFAULT NOW(),
        is_voided boolean NOT NULL DEFAULT false,
        void_reason text,
        created_at timestamp with time zone NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS supplier_payments_supplier_idx ON supplier_payments (supplier_id, payment_date);

      -- Purchases: allow backdating + link to supplier ledger
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS purchase_date timestamp with time zone NOT NULL DEFAULT NOW();
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS amount_paid numeric(12, 2) NOT NULL DEFAULT 0;

      -- Expenses: allow linking a party (e.g. paid to a supplier) — optional, non-breaking
      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_by_user_id integer;

      -- Sales: allow backdating the invoice date independent of created_at
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_date timestamp with time zone;
      UPDATE sales SET sale_date = created_at WHERE sale_date IS NULL;
      ALTER TABLE sales ALTER COLUMN sale_date SET DEFAULT NOW();
      ALTER TABLE sales ALTER COLUMN sale_date SET NOT NULL;

      -- General ledger (unified cross-module feed for dashboard/calendar/reports)
      CREATE TABLE IF NOT EXISTS general_ledger_entries (
        id serial PRIMARY KEY,
        date timestamp with time zone NOT NULL,
        type text NOT NULL,
        reference_id integer,
        party_type text NOT NULL DEFAULT 'none',
        party_id integer,
        party_name text,
        amount numeric(14, 2) NOT NULL,
        direction text NOT NULL,
        note text,
        created_by_user_id integer,
        created_at timestamp with time zone NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS general_ledger_date_idx ON general_ledger_entries (date);
      CREATE INDEX IF NOT EXISTS general_ledger_type_idx ON general_ledger_entries (type, date);
      CREATE INDEX IF NOT EXISTS general_ledger_party_idx ON general_ledger_entries (party_type, party_id, date);

      CREATE TABLE IF NOT EXISTS stock_adjustments (
        id serial PRIMARY KEY,
        product_id integer NOT NULL REFERENCES products(id),
        direction text NOT NULL,
        quantity integer NOT NULL,
        reason text NOT NULL,
        notes text,
        created_by_user_id integer,
        created_at timestamp with time zone NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS stock_adjustments_product_idx ON stock_adjustments (product_id, created_at);

      CREATE TABLE IF NOT EXISTS reminders (
        id serial PRIMARY KEY,
        title text NOT NULL,
        description text,
        due_date timestamp with time zone NOT NULL,
        related_type text,
        related_id integer,
        is_completed boolean NOT NULL DEFAULT false,
        created_by_user_id integer,
        created_at timestamp with time zone NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS reminders_due_idx ON reminders (due_date, is_completed);

      -- Month closing snapshots: stores computed month-end balances and metrics
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

      -- Recent activity dismissals: per-user records of items they hid from the activity feed
      CREATE TABLE IF NOT EXISTS user_recent_activity_dismissals (
        id serial PRIMARY KEY,
        user_id integer NOT NULL,
        activity_type text NOT NULL,
        activity_id integer NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT NOW(),
        CONSTRAINT user_activity_unique UNIQUE (user_id, activity_type, activity_id)
      );
      CREATE INDEX IF NOT EXISTS user_recent_activity_dismissals_user_idx ON user_recent_activity_dismissals (user_id);

      CREATE TABLE IF NOT EXISTS financial_periods (
        id serial PRIMARY KEY,
        year integer NOT NULL,
        month integer NOT NULL,
        status text NOT NULL DEFAULT 'open',
        opening_cash numeric(14,2) NOT NULL DEFAULT 0,
        opening_stock_value numeric(14,2) NOT NULL DEFAULT 0,
        opening_stock_quantity numeric(14,2) NOT NULL DEFAULT 0,
        opening_customer_balance numeric(14,2) NOT NULL DEFAULT 0,
        opening_supplier_balance numeric(14,2) NOT NULL DEFAULT 0,
        closing_cash numeric(14,2) NOT NULL DEFAULT 0,
        closing_stock_value numeric(14,2) NOT NULL DEFAULT 0,
        closing_stock_quantity numeric(14,2) NOT NULL DEFAULT 0,
        closing_customer_balance numeric(14,2) NOT NULL DEFAULT 0,
        closing_supplier_balance numeric(14,2) NOT NULL DEFAULT 0,
        closed_at timestamp with time zone,
        closed_by_user_id integer,
        updated_after_closing boolean NOT NULL DEFAULT false,
        created_at timestamp with time zone NOT NULL DEFAULT NOW(),
        updated_at timestamp with time zone NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS financial_periods_year_month_idx ON financial_periods (year, month);

      CREATE TABLE IF NOT EXISTS financial_period_snapshots (
        id serial PRIMARY KEY,
        period_id integer NOT NULL,
        snapshot_type text NOT NULL DEFAULT 'monthly',
        summary jsonb NOT NULL DEFAULT '{}'::jsonb,
        sales_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
        purchase_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
        profit_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
        inventory_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
        customer_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
        supplier_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
        cash_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
        top_products jsonb NOT NULL DEFAULT '[]'::jsonb,
        top_customers jsonb NOT NULL DEFAULT '[]'::jsonb,
        top_suppliers jsonb NOT NULL DEFAULT '[]'::jsonb,
        kpi_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp with time zone NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS financial_period_snapshots_period_idx ON financial_period_snapshots (period_id, created_at);

      CREATE TABLE IF NOT EXISTS financial_period_balances (
        id serial PRIMARY KEY,
        period_id integer NOT NULL,
        balance_type text NOT NULL,
        opening_balance numeric(14,2) NOT NULL DEFAULT 0,
        closing_balance numeric(14,2) NOT NULL DEFAULT 0,
        notes text,
        is_carry_forward boolean NOT NULL DEFAULT false,
        created_at timestamp with time zone NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS financial_period_balances_period_idx ON financial_period_balances (period_id, balance_type);

      CREATE TABLE IF NOT EXISTS financial_period_audit_logs (
        id serial PRIMARY KEY,
        period_id integer NOT NULL,
        entity_type text NOT NULL,
        action text NOT NULL,
        old_value text,
        new_value text,
        reason text,
        performed_by_user_id integer,
        ip_address text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp with time zone NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS financial_period_audit_logs_period_idx ON financial_period_audit_logs (period_id, created_at);
    `);

    const usersTableCheck = await pool.query(`
      SELECT to_regclass('public.users') AS table_name
    `);

    if (usersTableCheck.rows[0]?.table_name) {
      const adminPasswordHash = await bcrypt.hash("admin123", 10);
      await pool.query(
        `
          INSERT INTO users (name, email, role, password, phone, is_active)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (email) DO UPDATE SET
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            password = EXCLUDED.password,
            phone = EXCLUDED.phone,
            is_active = EXCLUDED.is_active
        `,
        ["Admin", "admin@alghani.com", "admin", adminPasswordHash, "03001234567", true],
      );
    }
  } catch (error) {
    logger.error({ err: error }, "Failed to initialize database schema");
    throw error;
  }
}
