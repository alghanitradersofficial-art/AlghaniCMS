#!/usr/bin/env node
/**
 * Database Cleanup Script
 * Removes all dummy/test data while preserving users and settings
 * 
 * Usage: DATABASE_URL="..." node --input-type=module -e "$(cat scripts/cleanup-database.mjs)"
 * OR: From root: pnpm --filter @workspace/db run clean
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
  // Clear in reverse dependency order (most dependent first)
  // Preserve financial period and month closure history to avoid accidental loss
  // of closed-month accounting data. These tables must be managed via the
  // application's month-close workflow and migrations only.
  // "financial_period_audit",
  // "financial_period_balances",
  // "financial_period_snapshots",
  // "month_closures",
  // "financial_periods",
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

async function checkTableExists(tableName) {
  try {
    const result = await pool.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = $1 AND table_schema = 'public'
      )`,
      [tableName]
    );
    return result.rows[0].exists;
  } catch (error) {
    console.warn(`⚠️  Could not check table ${tableName}: ${error.message}`);
    return false;
  }
}

async function getTableRowCount(tableName) {
  try {
    const result = await pool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    return -1;
  }
}

async function clearTable(tableName) {
  try {
    const countBefore = await getTableRowCount(tableName);
    await pool.query(`TRUNCATE TABLE ${tableName} CASCADE`);
    console.log(`✅ Cleared ${tableName} (${countBefore} rows removed)`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to clear ${tableName}: ${error.message}`);
    return false;
  }
}

async function cleanup() {
  console.log("\n🗑️  DATABASE CLEANUP STARTED\n");
  console.log(`📊 Database: ${databaseUrl.split("@")[1]?.split("/")[0] || "unknown"}`);

  try {
    // Test connection
    const testConnection = await pool.query("SELECT 1");
    console.log("✅ Database connection successful\n");

    console.log("📋 Tables to clear:");
    for (const table of tablesToClear) {
      const exists = await checkTableExists(table);
      if (exists) {
        const count = await getTableRowCount(table);
        console.log(`  • ${table} (${count} rows)`);
      }
    }

    console.log("\n📋 Tables to preserve:");
    for (const table of tablesToKeep) {
      const exists = await checkTableExists(table);
      if (exists) {
        const count = await getTableRowCount(table);
        console.log(`  • ${table} (${count} rows - KEPT)`);
      }
    }

    // Get user confirmation
    console.log("\n⚠️  WARNING: This will delete all test/dummy data!");
    console.log("   Users and audit logs will be preserved.\n");

    const confirmDelete = process.argv.includes("--force") || process.argv.includes("-y");
    if (!confirmDelete) {
      console.log("📝 To confirm, run with --force flag:");
      console.log("   node scripts/cleanup-database.mjs --force\n");
      process.exit(0);
    }

    console.log("🔄 Starting cleanup...\n");

    // Disable foreign key checks temporarily
    await pool.query("SET session_replication_role = 'replica'");
    console.log("🔓 Disabled foreign key constraints temporarily\n");

    let clearedCount = 0;
    let failedCount = 0;

    // Clear each table
    for (const table of tablesToClear) {
      const exists = await checkTableExists(table);
      if (exists) {
        const success = await clearTable(table);
        if (success) {
          clearedCount++;
        } else {
          failedCount++;
        }
      }
    }

    // Re-enable foreign key checks
    await pool.query("SET session_replication_role = 'origin'");
    console.log("\n🔒 Re-enabled foreign key constraints\n");

    // Summary
    console.log("\n📊 CLEANUP SUMMARY");
    console.log(`✅ Tables cleared: ${clearedCount}`);
    if (failedCount > 0) {
      console.log(`❌ Tables failed: ${failedCount}`);
    }

    // Show preserved data
    console.log("\n✅ PRESERVED DATA:");
    for (const table of tablesToKeep) {
      const exists = await checkTableExists(table);
      if (exists) {
        const count = await getTableRowCount(table);
        console.log(`  • ${table}: ${count} rows`);
      }
    }

    console.log("\n✅ Database cleanup completed successfully!\n");
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ CLEANUP FAILED: ${error.message}\n`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

cleanup();
