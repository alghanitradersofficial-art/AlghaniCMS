const { Pool } = require('pg');
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL not set');
  process.exit(2);
}
const pool = new Pool({ connectionString });
(async () => {
  const client = await pool.connect();
  try {
    console.log('Connected to DB');
    const fkRes = await client.query(
      `SELECT conrelid::regclass AS table_from, conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint WHERE contype='f' AND confrelid = 'products'::regclass`);
    console.log('Foreign key constraints referencing products:');
    for (const row of fkRes.rows) {
      console.log('-', row.table_from, row.conname, row.def);
    }
    const tables = fkRes.rows.map(r => r.table_from);
    for (const tbl of tables) {
      try {
        const countRes = await client.query(`SELECT COUNT(*) AS count FROM ${tbl} WHERE product_id = $1`, [3]);
        console.log(`${tbl}: ${countRes.rows[0].count} rows referencing product 3`);
        if (Number(countRes.rows[0].count) > 0) {
          const sample = await client.query(`SELECT * FROM ${tbl} WHERE product_id = $1 LIMIT 5`, [3]);
          console.log('Sample rows:', sample.rows);
        }
      } catch (err) {
        console.warn(`Could not query ${tbl}:`, err.message || err);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
})().catch(err => { console.error(err); process.exit(1); });
