-- Run once against a freshly-provisioned database (after `pnpm --filter @workspace/db run push`)
-- to create the default logins documented in the README.
--
--   psql "$DATABASE_URL" -f lib/db/seed-users.sql
--
-- Passwords are stored in plain text here on purpose: the login route
-- (artifacts/api-server/src/routes/auth.ts) detects a non-bcrypt password on
-- first login and automatically re-hashes it with bcrypt. Change these
-- passwords after your first login in production.

INSERT INTO users (name, email, role, password, permissions, is_active)
VALUES
  ('Junaid Malik', 'junaid@alghani.pk', 'ceo', 'admin123', '[]', true),
  ('Muhammad Ghani', 'ceo@alghani.pk', 'ceo', 'admin123', '[]', true),
  ('Sajid Khan', 'admin@alghani.com', 'developer', 'admin123', '[]', true)
ON CONFLICT (email) DO NOTHING;
