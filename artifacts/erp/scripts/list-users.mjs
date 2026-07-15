import fs from 'fs';
import { Client } from 'pg';

const env = fs.readFileSync(new URL('../artifacts/api-server/.env', import.meta.url)).toString();
const envMap = Object.fromEntries(env.split(/\n+/).filter(Boolean).map(l => l.split('=',1)[0] ? l.split('=') : []));
const DATABASE_URL = env.split('\n').map(l=>l.trim()).find(l=>l.startsWith('DATABASE_URL='))?.slice('DATABASE_URL='.length);
if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in artifacts/api-server/.env');
  process.exit(1);
}

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  const res = await client.query('SELECT id, name, email, role, is_active FROM users ORDER BY id LIMIT 20');
  console.log(res.rows);
} catch (err) {
  console.error('Query failed', err);
} finally {
  await client.end();
}
