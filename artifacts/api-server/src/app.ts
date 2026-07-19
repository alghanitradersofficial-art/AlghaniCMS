import express, { type Express } from "express";
import cors from "cors";
import helmetPkg from "helmet";
import rateLimitPkg from "express-rate-limit";
import { pinoHttp } from "pino-http"; // Fixed: Using named import
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { initTelegramBot } from "./routes/telegram.js";
import { errorHandler } from "./lib/error-handler.js";
import { requestSanitizer } from "./lib/security.js";

const app: Express = express();
const helmet = (helmetPkg as any).default ? (helmetPkg as any).default : helmetPkg;
const rateLimit = (rateLimitPkg as any).default ? (rateLimitPkg as any).default : rateLimitPkg;

app.set("trust proxy", 1);
app.disable("x-powered-by");

// ─── CORS ORIGINS CONFIGURATION ─────────────────────────────────────────────
const frontendUrl = process.env.FRONTEND_URL?.trim();
const configuredAllowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const allowedOrigins = [frontendUrl, ...configuredAllowedOrigins].filter(Boolean) as string[];

// ─── GLOBAL CORS/OPTIONS BYPASS (CRITICAL FOR CORS & 401 FIXES) ─────────────
// Is middleware ko routes aur rate limiters se pehle lagaya hai taake OPTIONS requests bypass ho sakein
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isAllowed = !origin || process.env.NODE_ENV !== "production" || allowedOrigins.includes(origin);

  if (origin && isAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Accept-Version");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(204).end(); // OPTIONS check ko direct 204 No Content de kar yahin rok dein
  }
  next();
});

// Security headers set karna
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
      res(res) { return { statusCode: res.statusCode }; },
    },
  }),
);

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (process.env.NODE_ENV !== "production") return callback(null, true);
    if (!origin) return callback(null, false);
    const isAllowed = allowedOrigins.includes(origin);
    if (!isAllowed) {
      logger.warn({ origin }, "Rejected CORS request for unlisted origin.");
    }
    return callback(null, isAllowed);
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(helmet());

// Global Rate Limiter
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  }),
);

// Auth Rate Limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again later." },
});

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(requestSanitizer);

if (process.env.NODE_ENV !== "production") {
  app.get("/api/_routes", (_req, res) => {
    try {
      const out: Array<{ path: string; methods: string[] }> = [];
      const walk = (stack: any[], prefix = "") => {
        for (const layer of stack) {
          if (layer.route && layer.route.path) {
            const fullPath = prefix + layer.route.path;
            const methods = Object.keys(layer.route.methods || {}).map((m) => m.toUpperCase());
            out.push({ path: fullPath, methods });
          } else if (layer.name === "router" && layer.handle && layer.handle.stack) {
            const layerPath = layer.regexp?.fast_star ? "" : layer.regexp?.fast_slash ? "" : layer.regexp?.source || "";
            walk(layer.handle.stack, prefix + (layerPath === "" ? "" : layerPath.replace(/\^\\\/?|\\\/?\$$/g, "")));
          }
        }
      };
      walk((router as any).stack || []);
      return res.json(out.sort((a, b) => a.path.localeCompare(b.path)));
    } catch (err) {
      return res.status(500).json({ error: "Failed to enumerate routes" });
    }
  });
}

app.get("/", (_req, res) => {
  const frontendUrl = process.env.FRONTEND_URL?.trim();
  if (frontendUrl) {
    res.setHeader("Location", frontendUrl);
    return res.status(302).end();
  }
  return res.status(404).json({ error: "Not found" });
});

// Sensitive Auth Routes par custom rate limit apply karna
app.use("/api/auth", authLimiter);

// Development-only debug endpoint
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/_debug/build-wb', async (_req, res) => {
    try {
      try {
        const expMod = await import('./routes/export.js');
        const buildFullReportWorkbook = expMod.buildFullReportWorkbook;
        const wb = await buildFullReportWorkbook({ preset: 'all' });
        return res.json({ sheets: wb.worksheets.map((ws: any) => ws.name) });
      } catch (err) {
        try { console.error('app debug buildFullReportWorkbook failed:', (err as any)?.stack || JSON.stringify(err)); } catch (e) { console.error('app debug buildFullReportWorkbook failed (unknown):', err); }
        return res.status(500).json({ error: 'build failed', detail: (err as any)?.message || String(err) });
      }
    } catch (err) {
      return res.status(500).json({ error: 'internal' });
    }
  });
}

app.use("/api", router);

// Handle Errors Globally
app.use(errorHandler);

// Always initialize the bot so REST-triggered sendMessage calls (used by
// /api/telegram/send and /api/telegram/test) work on Vercel too — only the
// long-polling loop needs to be skipped there, and initTelegramBot() already
// does that internally (it only calls bot.startPolling() when
// process.env["VERCEL"] is not set).
try {
  initTelegramBot();
} catch (e) {
  logger.warn("Telegram bot init failed");
}

export default app;