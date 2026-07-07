import express, { type Express } from "express";
import cors from "cors";
import { pinoHttp } from "pino-http"; // Fixed: Using named import
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { initTelegramBot } from "./routes/telegram.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
      res(res) { return { statusCode: res.statusCode }; },
    },
  }),
);
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

app.use("/api", router);

// Only initialize the Telegram bot loop if we are NOT on Vercel.
// On Vercel, long-polling freezes the function. Use webhooks instead for production.
if (!process.env["VERCEL"]) {
  try { 
    initTelegramBot(); 
  } catch (e) { 
    logger.warn("Telegram bot init failed"); 
  }
} else {
  logger.info("Skipping Telegram long-polling on Vercel environment.");
}

export default app;