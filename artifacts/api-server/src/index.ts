import path from "node:path";
import { fileURLToPath } from "node:url";

const { logger } = await import("./lib/logger.js");
const { initializeDatabase } = await import("./lib/init-db.js");
const { default: app } = await import("./app.js");

// Initialize DB for serverless/runtime environments. Do not load local .env or
// call app.listen here — the runtime (Vercel) will invoke the exported app.
initializeDatabase()
  .then(() => {
    logger.info("Database initialized successfully");
  })
  .catch((err) => {
    logger.error({ err }, "Database initialization failed");
  });

// Export the express app for Vercel's Node runtime
export default app;
