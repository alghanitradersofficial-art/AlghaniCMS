import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(moduleDir, "..", ".env");
if (typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envPath);
}

const { logger } = await import("./lib/logger.js");
const { initializeDatabase } = await import("./lib/init-db.js");
const { default: app } = await import("./app.js");

const rawPort = process.env["PORT"];

// Initialize DB immediately for the serverless function environment
initializeDatabase()
  .then(() => {
    logger.info("Database initialized successfully");
  })
  .catch((err) => {
    logger.error({ err }, "Database initialization failed");
  });

// ONLY call app.listen if we are NOT running on Vercel (local development)
if (!process.env["VERCEL"]) {
  if (!rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided.",
    );
  }

  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  app.listen(port, () => {
    logger.info({ port }, "Server listening locally");
  });
}

// CRITICAL: Vercel needs the express app exported as default
export default app;
