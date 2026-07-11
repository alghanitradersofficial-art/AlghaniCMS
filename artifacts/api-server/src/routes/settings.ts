import { Router } from "express";
import settingsService from "../services/settings.service.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const settings = await settingsService.getCompanySettings();
    return res.json(settings);
  } catch (error) {
    console.error(error);
    return res.json(settingsService.DEFAULT_SETTINGS);
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
    const result = await pool.query(`SELECT * FROM report_schedules ORDER BY created_at DESC`);
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch schedules" });
  }
});

router.post("/report-schedules", async (req, res) => {
  try {
    const { reportType, frequency, sendTo, whatsappNumbers } = req.body;
    const result = await pool.query(
      `INSERT INTO report_schedules (report_type, frequency, send_to, whatsapp_numbers) VALUES ($1, $2, $3, $4) RETURNING *`,
      [reportType, frequency, JSON.stringify(sendTo || []), JSON.stringify(whatsappNumbers || [])]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: "Failed to create schedule" });
  }
});

router.patch("/report-schedules/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { isActive, sendTo, whatsappNumbers, frequency } = req.body;
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (isActive !== undefined) { updates.push(`is_active = $${idx++}`); values.push(isActive); }
    if (sendTo !== undefined) { updates.push(`send_to = $${idx++}`); values.push(JSON.stringify(sendTo)); }
    if (whatsappNumbers !== undefined) { updates.push(`whatsapp_numbers = $${idx++}`); values.push(JSON.stringify(whatsappNumbers)); }
    if (frequency !== undefined) { updates.push(`frequency = $${idx++}`); values.push(frequency); }
    values.push(id);
    if (updates.length === 0) return res.status(400).json({ error: "Nothing to update" });
    const result = await pool.query(`UPDATE report_schedules SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`, values);
    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ error: "Failed to update schedule" });
  }
});

router.delete("/report-schedules/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await pool.query(`DELETE FROM report_schedules WHERE id = $1`, [id]);
    res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete schedule" });
  }
});

export default router;
