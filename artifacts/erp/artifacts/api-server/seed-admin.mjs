import bcrypt from 'bcryptjs';
import { pool } from '@workspace/db';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

(async () => {
  const client = await pool.connect();

  try {
    const passwordHash = await bcrypt.hash('admin123', 10);
    await client.query(
      'INSERT INTO users (name, email, role, password, phone, is_active) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (email) DO NOTHING',
      ['Admin', 'admin@alghani.com', 'admin', passwordHash, '03001234567', true],
    );

    const result = await client.query('SELECT id, email, role FROM users WHERE email = $1', ['admin@alghani.com']);
    console.log(JSON.stringify(result.rows[0]));
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
