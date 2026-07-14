Deployment to Vercel

This repository is a pnpm workspace with two app targets:
- `artifacts/erp` — React + Vite frontend
- `artifacts/api-server` — Express + TypeScript backend (exported as an Express app for serverless)

What I added to prepare for Vercel:
- `vercel.json` — build configuration and routing
- `api/index.js` — serverless wrapper that imports the built Express app
- SQL migration file: `lib/db/migrations/20260711_add_month_closures.sql`

Pre-requisites (set in Vercel project Environment Variables):
- `DATABASE_URL` — Postgres connection string (required)
- `JWT_SECRET` — JWT secret used by the API
- Any other env variables used by the project (SMTP, CLOUDINARY, OPENAI, etc.)

Build & Deploy (automatic via Vercel):
1. Push code to GitHub.
2. Create a new Vercel Project and import this repository.
3. Vercel will run the root `build` script. Ensure `pnpm` is selected as the Package Manager in Vercel settings.

Local test build

Install dependencies (pnpm required):

```bash
pnpm install
```

Build the workspace (root `build` runs typecheck & builds subprojects):

```bash
pnpm run build
```

Preview frontend locally:

```bash
pnpm --filter @workspace/erp run serve
```

Run backend locally (requires `DATABASE_URL` and other envs):

```bash
cd artifacts/api-server
pnpm run build
export DATABASE_URL="postgres://..."
node --enable-source-maps ./dist/index.mjs
```

Notes & Caveats

- Vercel serverless functions have cold-start limitations; long-running background jobs (cron, Telegram bot) should be moved to a separate worker or hosted elsewhere.
- Ensure `initializeDatabase()` can run safely in serverless environment — it's called at module import in `artifacts/api-server/src/index.ts`.
- For heavy DB migrations, run Drizzle migrations from CI or a one-off migration runner (don't rely on serverless function startup for bulk migrations).

If you want, I can:
- Add GitHub Actions to run migrations and tests during CI.
- Convert background workers (cron, telegram) to separate deployments (e.g., Railway / Fly / standalone server).
- Harden the Vercel wrapper to handle edge cases and warm starts.
