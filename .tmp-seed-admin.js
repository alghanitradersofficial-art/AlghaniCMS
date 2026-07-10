const bcrypt = require('bcryptjs');
const { Client } = require('pg');
(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const passwordHash = await bcrypt.hash('admin123', 10);
  const existing = await client.query('SELECT id FROM users WHERE email=$1', ['admin@alghani.com']);
  if (existing.rows.length === 0) {
    await client.query(
      'INSERT INTO users (name, email, role, password, phone, is_active) VALUES ($1, $2, $3, $4, $5, $6)',
      ['Admin', 'admin@alghani.com', 'admin', passwordHash, '03001234567', true]
    );
  }
  const res = await client.query('SELECT id, email, role FROM users WHERE email=$1', ['admin@alghani.com']);
  console.log(JSON.stringify(res.rows[0]));
  await client.end();
})().catch((err) => { console.error(err); process.exit(1); });
