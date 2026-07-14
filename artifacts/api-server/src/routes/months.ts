import { Router } from "express";
import monthsService from "../services/months.service.js";
import { getUserIdFromRequest } from "../lib/auth-context.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const rows = await monthsService.listClosures();
    return res.json({ data: rows });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to list month closures" });
  }
});

router.get("/overview", async (req, res) => {
  try {
    const overview = await monthsService.getCurrentPeriodOverview();
    return res.json(overview);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to load financial period overview" });
  }
});

router.post("/reopen", async (req, res) => {
  try {
    const { year, month, reason } = req.body;
    if (!year || !month) return res.status(400).json({ error: "year and month required" });
    const actorUserId = getUserIdFromRequest(req);
    const result = await monthsService.reopenMonth(year, month, actorUserId, reason || "Reopened by administrator");
    return res.json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to reopen month" });
  }
});

/**
 * Recompute a closed month's stored numbers from current transaction data
 * and cascade the fix forward through every later closed month's opening
 * balances. Use this after editing entries inside a reopened month, so the
 * Months page reflects reality again without having to fully close the
 * month a second time.
 */
router.post("/recalculate", async (req, res) => {
  try {
    const { year, month } = req.body;
    if (!year || !month) return res.status(400).json({ error: "year and month required" });
    const actorUserId = getUserIdFromRequest(req);
    await monthsService.recalculateForwardChain(year, month, actorUserId);
    return res.json({ ok: true, message: `Recalculated ${year}-${month} and all later closed months.` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to recalculate month" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const row = await monthsService.getClosure(id);
    if (!row) return res.status(404).json({ error: "Closure not found" });
    return res.json(row);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch closure" });
  }
});

router.post("/close", async (req, res) => {
  try {
    const { year, month, from, to } = req.body;
    if (!year || !month) return res.status(400).json({ error: "year and month required" });
    const actorUserId = getUserIdFromRequest(req);
    const periodStart = from ? new Date(from) : new Date(year, month - 1, 1);
    const periodEnd = to ? new Date(to) : new Date(year, month, 0, 23, 59, 59, 999);

    const inserted = await monthsService.closeMonth(year, month, actorUserId, periodStart, periodEnd);
    return res.status(inserted?.alreadyClosed ? 200 : 201).json(inserted);
  } catch (error: any) {
    console.error(error);
    // If the month is already closed, return a success response instead of an error
    if (error?.message?.includes("already exists")) {
      return res.status(200).json({ ok: true, message: "Month is already closed" });
    }
    return res.status(500).json({ error: "Failed to close month" });
  }
});

export default router;
