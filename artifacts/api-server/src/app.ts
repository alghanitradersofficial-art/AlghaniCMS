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

const frontendUrl = process.env.FRONTEND_URL?.trim();
const configuredAllowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const allowedOrigins = [frontendUrl, ...configuredAllowedOrigins].filter(Boolean) as string[];
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
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  }),
);
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

app.use("/api/auth", authLimiter);

// Development-only debug endpoint to build the full report workbook and return sheet names or error.
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