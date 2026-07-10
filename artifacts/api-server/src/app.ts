import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http"; // Fixed: Using named import
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { initTelegramBot } from "./routes/telegram.js";
import { errorHandler } from "./lib/error-handler.js";

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

const frontendUrl = process.env.FRONTEND_URL;
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (process.env.NODE_ENV !== "production") return callback(null, true);
    if (!frontendUrl) return callback(new Error("FRONTEND_URL must be configured in production"));
    return callback(null, origin === frontendUrl);
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(helmet());
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  }),
);
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