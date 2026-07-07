/**
 * Vercel zero-config Node.js Serverless Function entrypoint.
 *
 * IMPORTANT: This file must exist at `api/index.ts` — Vercel's build system
 * (and this project's vercel.json/tsconfig.json) reference it explicitly.
 * When it's present, Vercel's own @vercel/node builder compiles + traces
 * this file (and everything it imports) directly, so it never falls back to
 * the "detect an Express app" heuristic that fails against bundled output.
 *
 * This is intentionally a thin re-export of the real app — it does NOT use
 * the custom esbuild bundle in `dist/`. That bundle (produced by build.mjs)
 * is for running the server as a long-lived Node process elsewhere (VPS,
 * Docker, etc.) via `pnpm start`. On Vercel, @vercel/node bundles this file
 * itself and automatically traces real runtime dependencies (express,
 * nodemailer, pdfkit, exceljs, etc.) into the deployed function.
 */
import app from "../src/app";
import { initializeDatabase } from "../src/lib/init-db";
import { logger } from "../src/lib/logger";

// Kick off DB initialization on cold start. We intentionally do not block
// module evaluation on this; init-db.ts uses `CREATE TABLE IF NOT EXISTS` /
// `ADD COLUMN IF NOT EXISTS`, so it is safe to run concurrently with the
// first few requests hitting the DB pool.
let dbReady: Promise<void> | null = null;
function ensureDbInitialized(): Promise<void> {
  if (!dbReady) {
    dbReady = initializeDatabase().catch((err) => {
      logger.error({ err }, "Database initialization failed");
      dbReady = null; // allow a retry on the next invocation instead of caching the failure forever
      throw err;
    });
  }
  return dbReady;
}

void ensureDbInitialized();

// Vercel's Node runtime supports an Express app as the default export
// directly (it is callable as `(req, res) => void`), but we wrap it so we
// can guarantee the DB is initialized before the first request is handled
// on a cold start, without adding latency on warm invocations.
export default async function handler(
  req: import("express").Request,
  res: import("express").Response,
) {
  await ensureDbInitialized();
  return app(req, res);
}
