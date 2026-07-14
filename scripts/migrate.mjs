#!/usr/bin/env node
/**
 * Migration script — runs Drizzle push to create/update all tables.
 * Usage: pnpm run migrate
 */
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

console.log('🔄 Running Drizzle schema push...');
try {
  execSync('pnpm --filter @workspace/db drizzle-kit push', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env }
  });
  console.log('✅ Database schema pushed successfully');
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
}
