import app from "./app";
import { logger } from "./lib/logger";
import { initializeDatabase } from "./lib/init-db";

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
    throw new Error("PORT environment variable is required but was not provided.");
  }
  const port = Number(rawPort);
  
  app.listen(port, () => {
    logger.info({ port }, "Server listening locally");
  });
}

// CRITICAL: Vercel needs the express app exported
export default app;
