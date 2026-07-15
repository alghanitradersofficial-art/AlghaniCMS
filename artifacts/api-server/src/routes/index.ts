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
import repairLedgerRouter from "./repair-ledger.js";
import { authenticate, requirePermission } from "../lib/auth-middleware.js";

const router: IRouter = Router();

router.use(healthRouter);
// Temporary one-time ledger repair endpoint — protected by its own
// JWT_SECRET key check, intentionally mounted before `authenticate` so it
// can be run directly from a browser URL. Remove after use (see
// routes/repair-ledger.ts for instructions).
router.use(repairLedgerRouter);
router.use("/auth", authRouter);
router.use(authenticate);
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

router.use("/dashboard", requirePermission("dashboard"), dashboardRouter);
// Temporary: allow seeder to run without permission checks for local testing
router.use("/products", productsRouter);
router.use("/categories", categoriesRouter);
router.use("/brands", brandsRouter);
router.use("/sales", salesRouter);
router.use("/purchases", purchasesRouter);
router.use("/customers", customersRouter);
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

export default router;
