import fs from 'fs/promises';
import path from 'path';
import pg from 'pg';

const migrationsDir = path.join(process.cwd(), 'lib', 'db', 'migrations');
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not set — skipping migrations');
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS migrations_applied (
      id serial PRIMARY KEY,
      filename text NOT NULL UNIQUE,
      applied_at timestamp with time zone NOT NULL DEFAULT NOW()
    );
  `);
}

async function run() {
  const files = await fs.readdir(migrationsDir);
  const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();
  const client = await pool.connect();
  try {
    await ensureTable(client);
    for (const file of sqlFiles) {
      const res = await client.query('SELECT 1 FROM migrations_applied WHERE filename = $1', [file]);
      if (res.rowCount > 0) {
        console.log(`Skipping already-applied migration: ${file}`);
        continue;
      }
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      console.log(`Applying migration: ${file}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO migrations_applied (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Applied: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Failed to apply ${file}:`, err);
        throw err;
      }
    }
    console.log('Migrations complete');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
