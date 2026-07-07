import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

const DEFAULT_SETTINGS = {
  company: {
    name: "Al Ghani Wholesale Traders",
    address: "Shop No. 12, Hafeez Centre, Gulberg III, Lahore, Pakistan",
    phone: "+92-42-35761234",
    email: "info@alghani.com",
    website: "www.alghani.com",
    ntn: "1234567-8",
    strn: "12-34-5678-001-23",
    branch: "Main Branch - Lahore",
    ceoName: "Mr. Abdul Ghani",
    ceoPhone: "+92-300-1234567",
    ceoEmail: "ceo@alghani.com",
  },
  branding: {
    primaryColor: "#DC2626",
    accentColor: "#D97706",
    footerText: "Al Ghani Wholesale Traders - Your Trusted Partner in Motorcycle Parts",
  },
  reports: {
    schedules: [],
  },
};

function parseDbValue(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`SELECT key, value FROM company_settings`);
    const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const row of result.rows) {
      settings[row.key] = parseDbValue(row.value);
    }
    return res.json(settings);
  } catch (error) {
    console.error(error);
    return res.json(DEFAULT_SETTINGS);
  }
});

router.patch("/", async (req, res) => {
  try {
    const updates = req.body as Record<string, unknown>;
    for (const [key, value] of Object.entries(updates)) {
      await pool.query(
        `INSERT INTO company_settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, JSON.stringify(value)]
      );
    }
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
