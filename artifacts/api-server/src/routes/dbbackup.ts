import { Router } from "express";
import { pool } from "@workspace/db";
import { ZipArchive } from "archiver";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TABLES = ["categories", "brands", "products", "customers", "suppliers", "sales", "purchases", "users", "expenses", "company_settings", "notifications", "report_schedules"];

// ─── FULL DB JSON EXPORT ──────────────────────────────────────────────────────
router.get("/export/json", async (req, res) => {
  try {
    const dump: Record<string, unknown[]> = {};
    for (const table of TABLES) {
      try {
        const result = await pool.query(`SELECT * FROM ${table}`);
        dump[table] = result.rows;
      } catch { dump[table] = []; }
    }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="alghani-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    return res.json({ exportedAt: new Date().toISOString(), version: "1.0", tables: dump });
  } catch (error) {
    return res.status(500).json({ error: "Export failed" });
  }
});

// ─── FULL DB SQL EXPORT ────────────────────────────────────────────────────────
router.get("/export/sql", async (req, res) => {
  try {
    let sql = `-- Al Ghani ERP Database Backup\n-- Generated: ${new Date().toISOString()}\n-- Tables: ${TABLES.join(", ")}\n\nSET client_encoding = 'UTF8';\n\n`;

    for (const table of TABLES) {
      try {
        const result = await pool.query(`SELECT * FROM ${table}`);
        if (!result.rows.length) continue;
        sql += `-- Table: ${table}\n`;
        for (const row of result.rows) {
          const cols = Object.keys(row).map(c => `"${c}"`).join(", ");
          const vals = Object.values(row).map(v => {
            if (v === null) return "NULL";
            if (typeof v === "number") return String(v);
            if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
            if (v instanceof Date) return `'${v.toISOString()}'`;
            if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
            return `'${String(v).replace(/'/g, "''")}'`;
          }).join(", ");
          sql += `INSERT INTO ${table} (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;\n`;
        }
        sql += "\n";
      } catch { continue; }
    }

    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", `attachment; filename="alghani-backup-${new Date().toISOString().slice(0, 10)}.sql"`);
    return res.send(sql);
  } catch (error) {
    return res.status(500).json({ error: "SQL export failed" });
  }
});

// ─── IMPORT FROM JSON ─────────────────────────────────────────────────────────
router.post("/import/json", async (req, res) => {
  try {
    const { tables } = req.body;
    if (!tables || typeof tables !== "object") return res.status(400).json({ error: "Invalid backup file" });

    let imported = 0;
    const errors: string[] = [];

    for (const [table, rows] of Object.entries(tables)) {
      if (!TABLES.includes(table)) continue;
      if (!Array.isArray(rows) || !rows.length) continue;
      const cols = Object.keys(rows[0] as Record<string, unknown>);
      for (const row of rows as Record<string, unknown>[]) {
        try {
          const vals = cols.map(c => (row as Record<string, unknown>)[c]);
          const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
          await pool.query(
            `INSERT INTO ${table} (${cols.map(c => `"${c}"`).join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            vals
          );
          imported++;
        } catch (e: unknown) {
          errors.push(`${table}: ${(e as Error).message}`);
        }
      }
    }

    return res.json({ success: true, imported, errors: errors.slice(0, 20) });
  } catch (error) {
    return res.status(500).json({ error: "Import failed: " + (error as Error).message });
  }
});

// ─── PROJECT ZIP DOWNLOAD ──────────────────────────────────────────────────────
router.get("/project-zip", async (req, res) => {
  try {
    const rootDir = path.resolve(__dirname, "../../../..");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="alghani-erp-${new Date().toISOString().slice(0, 10)}.zip"`);

    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on("error", (err: any) => { console.error(err); });
    archive.pipe(res);

    const ignore = ["node_modules", ".git", "dist", ".replit", ".local", ".cache", "__pycache__", ".env.local"];
    archive.glob("**/*", {
      cwd: rootDir,
      ignore: ignore.flatMap(i => [`${i}/**`, `**/${i}/**`, i]),
      dot: false,
    });

    await archive.finalize();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create ZIP" });
  }
});

// ─── DB STATS ─────────────────────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    const counts: Record<string, number> = {};
    for (const table of TABLES) {
      try {
        const r = await pool.query(`SELECT COUNT(*) as c FROM ${table}`);
        counts[table] = parseInt(r.rows[0].c);
      } catch { counts[table] = 0; }
    }
    return res.json({ tables: counts, exportedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: "Failed to get stats" });
  }
});

export default router;
