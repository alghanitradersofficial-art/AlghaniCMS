import { Router } from "express";
import settingsService, { DEFAULT_SETTINGS } from "../services/settings.service.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const settings = await settingsService.getCompanySettings();
    return res.json(settings);
  } catch (error) {
    console.error(error);
    return res.json(DEFAULT_SETTINGS);
  }
});

router.patch("/", async (req, res) => {
  try {
    const updates = req.body as Record<string, unknown>;
    const actorUserId = (req as any).auth?.id ?? null;
    const ipAddr = req.ip || (req.headers["x-forwarded-for"] as string) || null;
    await settingsService.upsertCompanySettings(updates, actorUserId, ipAddr);
    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to save settings" });
  }
});

router.get("/report-schedules", async (req, res) => {
  try {
    const rows = await settingsService.listReportSchedules();
    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch schedules" });
  }
});

router.post("/report-schedules", async (req, res) => {
  try {
    const data = req.body as any;
    const row = await settingsService.createReportSchedule({ reportType: data.reportType, frequency: data.frequency, sendTo: data.sendTo, whatsappNumbers: data.whatsappNumbers });
    return res.status(201).json(row);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create schedule" });
  }
});

router.patch("/report-schedules/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updates = req.body as Record<string, unknown>;
    const row = await settingsService.updateReportSchedule(id, updates);
    return res.json(row);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to update schedule" });
  }
});

router.delete("/report-schedules/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await settingsService.deleteReportSchedule(id);
    res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to delete schedule" });
  }
});

export default router;
