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
    return res.status(201).json(inserted);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to close month" });
  }
});

export default router;
