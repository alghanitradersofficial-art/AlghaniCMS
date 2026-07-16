import { Router } from "express";
import cashService from "../services/cash.service.js";
import { MonthClosedError } from "../services/months.service.js";
import { resolveRange, defaultBucketForRange } from "../lib/date-range.js";
import { getUserIdFromRequest } from "../lib/auth-context.js";

const router = Router();

// GET /api/cash/report?range=today|thisweek|thismonth|thisyear|custom&from=&to=&bucket=daily|weekly|monthly
// Cash-in-hand report with a running balance, bucketed daily/weekly/monthly
// (or whatever `bucket` is explicitly given) over any date range including
// custom start/end dates. Mirrors the same range presets used everywhere
// else in the app (see date-range-selector.tsx).
router.get("/report", async (req, res) => {
  try {
    const { start, end } = resolveRange(req);
    const range = (req.query.range as string) || "all";
    const bucket = (req.query.bucket as "daily" | "weekly" | "monthly") || defaultBucketForRange(range);
    const report = await cashService.getCashReport(start, end, bucket);
    return res.json({ range, bucket, from: start?.toISOString() ?? null, to: end?.toISOString() ?? null, ...report });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to generate cash in hand report" });
  }
});

// GET /api/cash/history?search=&range=&from=&to=
// Searchable transaction history (customer cash payments, supplier cash
// payments, cash expenses, and manual/old entries), newest first.
router.get("/history", async (req, res) => {
  try {
    const { start, end } = resolveRange(req);
    const search = (req.query.search as string) || undefined;
    const rows = await cashService.searchCashHistory({ search, start, end });
    return res.json({ data: rows });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to search cash history" });
  }
});

// POST /api/cash/entries
// Add a manual cash entry — opening balance for old/historical data, or an
// ad-hoc old_entry/adjustment. Blocked for dates inside an already-closed
// financial month, same rule as expenses/payments.
router.post("/entries", async (req, res): Promise<any> => {
  try {
    const { entryDate, type, direction, amount, note } = req.body ?? {};
    if (!entryDate || !direction || !amount) {
      return res.status(400).json({ error: "entryDate, direction, and amount are required" });
    }
    if (!["in", "out"].includes(direction)) {
      return res.status(400).json({ error: "direction must be 'in' or 'out'" });
    }
    const actorUserId = getUserIdFromRequest(req);
    const row = await cashService.addManualCashEntry({
      entryDate: new Date(entryDate),
      type: ["opening_balance", "old_entry", "adjustment"].includes(type) ? type : "old_entry",
      direction,
      amount: Number(amount),
      note: note ?? null,
      actorUserId,
    });
    return res.status(201).json(row);
  } catch (error) {
    console.error(error);
    if (error instanceof MonthClosedError) return res.status(409).json({ error: error.message });
    return res.status(500).json({ error: "Failed to add cash entry" });
  }
});

router.delete("/entries/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
    await cashService.deleteManualCashEntry(id);
    return res.status(204).send();
  } catch (error) {
    console.error(error);
    if (error instanceof MonthClosedError) return res.status(409).json({ error: error.message });
    return res.status(500).json({ error: "Failed to delete cash entry" });
  }
});

export default router;
