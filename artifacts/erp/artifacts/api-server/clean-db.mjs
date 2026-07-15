#!/usr/bin/env node
/**
 * Database Cleanup Script
 * Removes all dummy/test data while preserving users and settings
 * 
 * Run from root: pnpm --filter @workspace/api-server run clean-db
 */

import pkg from "pg";
const { Pool } = pkg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ ERROR: DATABASE_URL environment variable not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

const tablesToClear = [
  "financial_period_audit",
  "financial_period_balances",
  "financial_period_snapshots",
  "month_closures",
  "financial_periods",
  "stock_adjustments",
  "reminders",
  "notifications",
  "price_history",
  "supplier_ledger_entries",
  "ledger_entries",
  "general_ledger_entries",
  "expenses",
  "purchases",
  "sales",
  "supplier_products",
  "suppliers",
  "customers",
  "products",
  "categories",
  "brands",
];

const tablesToKeep = ["users", "audit_log"];

async function cleanup() {
  console.log("\n🗑️  DATABASE CLEANUP STARTED\n");

  try {
    await pool.query("SELECT 1");
    console.log("✅ Database connection successful\n");

    console.log("📋 Tables to clear:");
    for (const table of tablesToClear) {
      try {
        const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        const count = parseInt(result.rows[0].count, 10);
        console.log(`  • ${table} (${count} rows)`);
      } catch (err) {
        console.log(`  • ${table} (table not found)`);
      }
    }

    console.log("\n📋 Tables to preserve:");
    for (const table of tablesToKeep) {
      try {
        const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        const count = parseInt(result.rows[0].count, 10);
        console.log(`  • ${table} (${count} rows - KEPT)`);
      } catch (err) {
        console.log(`  • ${table} (table not found)`);
      }
    }

    console.log("\n⚠️  STARTING CLEANUP...\n");

    // Disable foreign key checks
    await pool.query("SET session_replication_role = 'replica'");

    let clearedCount = 0;
    for (const table of tablesToClear) {
      try {
        const countBefore = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        const count = parseInt(countBefore.rows[0].count, 10);
        await pool.query(`TRUNCATE TABLE ${table} CASCADE`);
        console.log(`✅ Cleared ${table} (${count} rows removed)`);
        clearedCount++;
      } catch (error) {
        // Table might not exist, skip silently
      }
    }

    // Re-enable foreign key checks
    await pool.query("SET session_replication_role = 'origin'");

    console.log(`\n✅ CLEANUP COMPLETE: ${clearedCount} tables cleared\n`);
    console.log("✅ PRESERVED DATA:");
    console.log("  • users (all user accounts)");
    console.log("  • audit_log (all audit trails)\n");

    process.exit(0);
  } catch (error) {
    console.error(`\n❌ CLEANUP FAILED: ${error.message}\n`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

cleanup();
