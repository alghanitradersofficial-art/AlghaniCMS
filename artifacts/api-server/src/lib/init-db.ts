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
    `);
  } catch (error) {
    logger.error({ err: error }, "Failed to initialize database schema");
    throw error;
  }
}
