import { pool } from "@workspace/db";

export const DEFAULT_SETTINGS = {
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

export async function getCompanySettings() {
  try {
    const result = await pool.query(`SELECT key, value FROM company_settings`);
    const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const row of result.rows) {
      settings[row.key] = parseDbValue(row.value);
    }
    return settings;
  } catch (error) {
    console.warn("getCompanySettings failed:", error);
    return DEFAULT_SETTINGS;
  }
}

export async function upsertCompanySettings(updates: Record<string, unknown>, actorUserId: number | null, ipAddr: string | null) {
  for (const [key, value] of Object.entries(updates)) {
    // fetch previous value for audit
    let prevValue: unknown = null;
    try {
      const prev = await pool.query(`SELECT value FROM company_settings WHERE key = $1 LIMIT 1`, [key]);
      if (prev.rows?.length) prevValue = prev.rows[0].value;
    } catch (err) {
      console.warn("Failed to read previous company_settings value", err);
    }

    await pool.query(
      `INSERT INTO company_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, JSON.stringify(value)],
    );

    // record audit log (best-effort)
    try {
      const action = prevValue === null ? "create" : "update";
      await pool.query(
        `INSERT INTO audit_log (entity_type, entity_id, action, field_name, old_value, new_value, performed_by_user_id, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          "company_settings",
          null,
          action,
          key,
          prevValue === null ? null : (typeof prevValue === "string" ? prevValue : JSON.stringify(prevValue)),
          JSON.stringify(value),
          actorUserId,
          ipAddr,
        ],
      );
    } catch (auditErr) {
      console.warn("Failed to write audit_log for company_settings", auditErr);
    }
  }
}

export async function listReportSchedules() {
  const result = await pool.query(`SELECT * FROM report_schedules ORDER BY created_at DESC`);
  return result.rows;
}

export async function createReportSchedule(data: { reportType: string; frequency: string; sendTo?: unknown[]; whatsappNumbers?: unknown[] }) {
  const { reportType, frequency, sendTo, whatsappNumbers } = data;
  const result = await pool.query(
    `INSERT INTO report_schedules (report_type, frequency, send_to, whatsapp_numbers) VALUES ($1, $2, $3, $4) RETURNING *`,
    [reportType, frequency, JSON.stringify(sendTo || []), JSON.stringify(whatsappNumbers || [])],
  );
  return result.rows[0];
}

export async function updateReportSchedule(id: number, updates: Record<string, unknown>) {
  const { isActive, sendTo, whatsappNumbers, frequency } = updates as any;
  const parts: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (isActive !== undefined) { parts.push(`is_active = $${idx++}`); values.push(isActive); }
  if (sendTo !== undefined) { parts.push(`send_to = $${idx++}`); values.push(JSON.stringify(sendTo)); }
  if (whatsappNumbers !== undefined) { parts.push(`whatsapp_numbers = $${idx++}`); values.push(JSON.stringify(whatsappNumbers)); }
  if (frequency !== undefined) { parts.push(`frequency = $${idx++}`); values.push(frequency); }
  if (parts.length === 0) throw new Error("Nothing to update");
  values.push(id);
  const result = await pool.query(`UPDATE report_schedules SET ${parts.join(", ")} WHERE id = $${idx} RETURNING *`, values);
  return result.rows[0];
}

export async function deleteReportSchedule(id: number) {
  await pool.query(`DELETE FROM report_schedules WHERE id = $1`, [id]);
}

export default {
  getCompanySettings,
  upsertCompanySettings,
  listReportSchedules,
  createReportSchedule,
  updateReportSchedule,
  deleteReportSchedule,
};
