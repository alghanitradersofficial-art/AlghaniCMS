/**
 * Database Cleanup Script
 * Removes all dummy/test data while preserving users and settings
 * 
 * Usage: DATABASE_URL="..." node --loader ts-node/esm cleanup.ts
 */

import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ ERROR: DATABASE_URL environment variable not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

const tablesToClear = [
  // Clear in reverse dependency order
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

const tablesToKeep = [
  "users",      // Keep user accounts
  "audit_log",  // Keep audit trail
];

async function getTableRowCount(tableName: string): Promise<number> {
  try {
    const result = await pool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
    return parseInt((result.rows[0]?.count as unknown as string) || "0", 10);
  } catch (error) {
    return -1;
  }
}

async function cleanup() {
  console.log("\n🗑️  DATABASE CLEANUP STARTED\n");

  try {
    // Test connection
    await pool.query("SELECT 1");
    console.log("✅ Database connection successful\n");

    console.log("📋 Tables to clear:");
    for (const table of tablesToClear) {
      const count = await getTableRowCount(table);
      if (count >= 0) {
        console.log(`  • ${table} (${count} rows)`);
      }
    }

    console.log("\n📋 Tables to preserve:");
    for (const table of tablesToKeep) {
      const count = await getTableRowCount(table);
      if (count >= 0) {
        console.log(`  • ${table} (${count} rows - KEPT)`);
      }
    }

    console.log("\n⚠️  WARNING: This will delete all test/dummy data!");
    console.log("   Users and audit logs will be preserved.\n");

    console.log("🔄 Starting cleanup...\n");

    // Disable foreign key checks temporarily
    await pool.query("SET session_replication_role = 'replica'");
    console.log("🔓 Disabled foreign key constraints\n");

    let clearedCount = 0;

    // Clear each table
    for (const table of tablesToClear) {
      try {
        const countBefore = await getTableRowCount(table);
        await pool.query(`TRUNCATE TABLE ${table} CASCADE`);
        console.log(`✅ Cleared ${table} (${countBefore} rows removed)`);
        clearedCount++;
      } catch (error) {
        console.error(`⚠️  Skipped ${table}: ${(error as Error).message}`);
      }
    }

    // Re-enable foreign key checks
    await pool.query("SET session_replication_role = 'origin'");
    console.log("\n🔒 Re-enabled foreign key constraints\n");

    // Summary
    console.log("📊 CLEANUP SUMMARY");
    console.log(`✅ Tables cleared: ${clearedCount}/${tablesToClear.length}`);

    // Show preserved data
    console.log("\n✅ PRESERVED DATA:");
    for (const table of tablesToKeep) {
      const count = await getTableRowCount(table);
      if (count >= 0) {
        console.log(`  • ${table}: ${count} rows`);
      }
    }

    console.log("\n✅ Database cleanup completed successfully!\n");
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ CLEANUP FAILED: ${(error as Error).message}\n`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

cleanup();
