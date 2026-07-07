import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function initializeDatabase() {
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
    `);
  } catch (error) {
    logger.error({ err: error }, "Failed to initialize database schema");
    throw error;
  }
}
