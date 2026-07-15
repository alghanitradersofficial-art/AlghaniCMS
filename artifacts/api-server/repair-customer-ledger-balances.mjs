// One-time repair script: recomputes every customer's ledger entry running
// balances in strict chronological order (entryDate, then id).
//
// Why this is needed: appendLedgerEntry() used to chain each new entry's
// running balance off the most-recently-INSERTED row, not the most-recent
// row BY DATE. Since sales/payments support backdating (entryDate can be
// earlier or later than "now"), any backdated entry broke the running
// balance chain for every entry after it. This has since been fixed going
// forward (see recomputeCustomerLedgerRunningBalances in lib/ledger.ts,
// now called after every ledger write), but existing historical data needs
// a one-time backfill to correct already-corrupted running balances.
//
// Usage:
//   cd artifacts/api-server
//   node repair-customer-ledger-balances.mjs            # dry run, reports discrepancies only
//   node repair-customer-ledger-balances.mjs --apply     # actually writes corrected balances
//
// Safe to re-run any number of times.

import { pool } from '@workspace/db';

const APPLY = process.argv.includes('--apply');

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows: customers } = await client.query(
      `SELECT id, name, opening_balance FROM customers ORDER BY id ASC`,
    );

    console.log(`Found ${customers.length} customers.`);
    console.log(APPLY ? 'Mode: APPLY (will write corrected balances)' : 'Mode: DRY RUN (no writes; use --apply to fix)');
    console.log('---');

    let customersWithDrift = 0;
    let entriesFixed = 0;

    for (const customer of customers) {
      const { rows: entries } = await client.query(
        `SELECT id, amount, running_balance, entry_date
         FROM customer_ledger_entries
         WHERE customer_id = $1
         ORDER BY entry_date ASC, id ASC`,
        [customer.id],
      );

      if (entries.length === 0) continue;

      let runningBalance = parseFloat(customer.opening_balance);
      let driftFoundForThisCustomer = false;

      for (const entry of entries) {
        runningBalance = round2(runningBalance + parseFloat(entry.amount));
        const storedBalance = parseFloat(entry.running_balance);

        if (Math.abs(runningBalance - storedBalance) > 0.005) {
          if (!driftFoundForThisCustomer) {
            console.log(`Customer #${customer.id} (${customer.name}): drift detected`);
            driftFoundForThisCustomer = true;
            customersWithDrift++;
          }
          console.log(`  entry #${entry.id} (${entry.entry_date.toISOString().slice(0, 10)}): stored=${storedBalance} correct=${runningBalance}`);
          entriesFixed++;

          if (APPLY) {
            await client.query(
              `UPDATE customer_ledger_entries SET running_balance = $1 WHERE id = $2`,
              [String(runningBalance), entry.id],
            );
          }
        }
      }
    }

    console.log('---');
    console.log(`Customers with drift: ${customersWithDrift}`);
    console.log(`Entries corrected: ${entriesFixed}`);
    if (!APPLY && entriesFixed > 0) {
      console.log('\nThis was a dry run. Re-run with --apply to write the corrected balances.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
