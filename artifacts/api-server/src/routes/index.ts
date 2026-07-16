import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import dashboardRouter from "./dashboard.js";
import productsRouter from "./products.js";
import categoriesRouter from "./categories.js";
import brandsRouter from "./brands.js";
import salesRouter from "./sales.js";
import purchasesRouter from "./purchases.js";
import customersRouter from "./customers.js";
import suppliersRouter from "./suppliers.js";
import usersRouter from "./users.js";
import expensesRouter from "./expenses.js";
import reportsRouter from "./reports.js";
import settingsRouter from "./settings.js";
import notificationsRouter from "./notifications.js";
import exportRouter, { buildFullReportWorkbook } from "./export.js";
import importRouter from "./import.js";
import uploadRouter from "./upload.js";
import telegramRouter from "./telegram.js";
import emailRouter from "./email.js";
import dbbackupRouter from "./dbbackup.js";
import ledgerRouter from "./ledger.js";
import priceHistoryRouter from "./price-history.js";
import paymentsRouter from "./payments.js";
import supplierProductsRouter from "./supplier-products.js";
import supplierLedgerRouter from "./supplier-ledger.js";
import productSuppliersRouter from "./product-suppliers.js";
import calendarRouter from "./calendar.js";
import stockAdjustmentsRouter from "./stock-adjustments.js";
import remindersRouter from "./reminders.js";
import monthsRouter from "./months.js";
import cashRouter from "./cash.js";
import repairLedgerRouter from "./repair-ledger.js";
import { authenticate, requirePermission } from "../lib/auth-middleware.js";

const router: IRouter = Router();
const isProduction = process.env.NODE_ENV === "production";

router.use(healthRouter);
// Temporary one-time ledger repair endpoint — protected by its own
// JWT_SECRET key check, intentionally mounted before `authenticate` so it
// can be run directly from a browser URL. Remove after use (see
// routes/repair-ledger.ts for instructions).
router.use(repairLedgerRouter);
router.use("/auth", authRouter);
router.use(authenticate);

// Debug/introspection routes are dev-only — they leaked auth tokens and
// internal report structure to anyone who could reach the server.
if (!isProduction) {
  // Temporary debug endpoint to verify authentication middleware sets `req.auth`.
  router.get('/_debug/auth', (req, res) => {
    return res.json({ auth: (req as any).auth || null });
  });

  // Debug: build the full report workbook and return sheet names (admin only)
  router.get('/_debug/build-wb', requirePermission('settings'), async (req, res) => {
    try {
      const wb = await buildFullReportWorkbook({ preset: 'all' });
      return res.json({ sheets: wb.worksheets.map(ws => ws.name) });
    } catch (err) {
      try { console.error('debug buildFullReportWorkbook failed:', (err as any)?.stack || JSON.stringify(err)); } catch (e) { console.error('debug buildFullReportWorkbook failed (unknown):', err); }
      return res.status(500).json({ error: 'build failed', detail: (err as any)?.message || String(err) });
    }
  });
}

router.use("/dashboard", requirePermission("dashboard"), dashboardRouter);
// Every module below now requires its matching permission — these used to be
// mounted with no permission check at all, so any authenticated user (any
// role) could read/write products, sales, purchases, and customers.
router.use("/products", requirePermission("inventory"), productsRouter);
router.use("/categories", requirePermission("inventory"), categoriesRouter);
router.use("/brands", requirePermission("inventory"), brandsRouter);
router.use("/sales", requirePermission("sales"), salesRouter);
router.use("/purchases", requirePermission("purchases"), purchasesRouter);
router.use("/customers", requirePermission("customers"), customersRouter);
router.use("/customers", requirePermission("customers"), priceHistoryRouter);
router.use("/customers", requirePermission("customers"), ledgerRouter);
router.use("/payments", requirePermission("payments"), paymentsRouter);
router.use("/suppliers", requirePermission("suppliers"), suppliersRouter);
router.use("/suppliers", requirePermission("suppliers"), supplierProductsRouter);
router.use("/suppliers", requirePermission("suppliers"), supplierLedgerRouter);
router.use("/products", requirePermission("inventory"), productSuppliersRouter);
router.use("/calendar", requirePermission("settings"), calendarRouter);
router.use("/stock-adjustments", requirePermission("inventory"), stockAdjustmentsRouter);
router.use("/reminders", requirePermission("notifications"), remindersRouter);
router.use("/months", requirePermission("settings"), monthsRouter);
router.use("/cash", requirePermission("reports"), cashRouter);
router.use("/users", requirePermission("users"), usersRouter);
router.use("/expenses", requirePermission("expenses"), expensesRouter);
router.use("/reports", requirePermission("reports"), reportsRouter);
router.use("/settings", requirePermission("settings"), settingsRouter);
router.use("/notifications", requirePermission("notifications"), notificationsRouter);
router.use("/export", requirePermission("settings"), exportRouter);
router.use("/import", requirePermission("settings"), importRouter);
router.use("/upload", requirePermission("inventory"), uploadRouter);
router.use("/telegram", requirePermission("settings"), telegramRouter);
router.use("/email", requirePermission("settings"), emailRouter);
router.use("/backup", requirePermission("settings"), dbbackupRouter);

// --- Path aliases for endpoints the frontend/clients called under the wrong
// path. Kept as thin redirects to the real handlers below so both old and
// new callers keep working.
router.post("/auth/register", requirePermission("users"), (req, res, next) => {
  (req as any).url = "/";
  usersRouter(req, res, next);
});
router.get("/products/low-stock", requirePermission("inventory"), (req, res, next) => {
  req.query.lowStock = "true";
  (req as any).url = "/";
  productsRouter(req, res, next);
});
router.get("/dashboard/activity", requirePermission("dashboard"), (req, res, next) => {
  (req as any).url = "/recent-activity" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");
  dashboardRouter(req, res, next);
});
router.get("/export/excel", requirePermission("settings"), (req, res, next) => {
  (req as any).url = "/report/excel" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");
  exportRouter(req, res, next);
});
router.get("/export/full-report", requirePermission("settings"), (req, res, next) => {
  (req as any).url = "/report/excel" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");
  exportRouter(req, res, next);
});
router.post("/email/send", requirePermission("settings"), (req, res, next) => {
  (req as any).url = "/send-report";
  emailRouter(req, res, next);
});

export default router;
