import { pool } from '@workspace/db';
import fs from 'fs';

async function main() {
  const client = await pool.connect();
  try {
    const year = 2026;
    const month = 7;
    const closureRes = await client.query(`SELECT * FROM month_closures WHERE year = $1 AND month = $2 ORDER BY created_at DESC LIMIT 1`, [year, month]);
    const closure = closureRes.rows[0] || null;
    const periodRes = await client.query(`SELECT * FROM financial_periods WHERE year = $1 AND month = $2 ORDER BY created_at DESC LIMIT 1`, [year, month]);
    const period = periodRes.rows[0] || null;
    const snapshotRes = await client.query(`SELECT * FROM financial_period_snapshots WHERE period_id = $1 ORDER BY created_at DESC LIMIT 1`, [period?.id || 0]);
    const snapshot = snapshotRes.rows[0] || null;

    const out = { closure, period, snapshot };
    fs.writeFileSync('monthly-report-2026-07.json', JSON.stringify(out, null, 2), 'utf8');
    console.log('Wrote monthly-report-2026-07.json');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
