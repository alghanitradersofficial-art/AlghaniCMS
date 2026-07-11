import { Router } from "express";
import { pool } from "@workspace/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { bot } from "./telegram.js";
import { logger } from "../lib/logger.js";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "development-fallback-secret";
if (!process.env.JWT_SECRET) {
  logger.warn("JWT_SECRET is not configured; using a local fallback secret for development.");
}
const JWT_EXPIRES = "30d";

function requireDatabase(res: any) {
  if (!pool) {
    res.status(503).json({ error: "Database unavailable" });
    return false;
  }
  return true;
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    if (!requireDatabase(res)) return;

    const result = await pool.query(
      `SELECT id, name, email, role, password, is_active, permissions FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );
    if (!result.rows.length) return res.status(401).json({ error: "Invalid credentials" });

    const user = result.rows[0];
    if (!user.is_active) return res.status(403).json({ error: "Account is disabled" });

    // Try bcrypt first, then plain-text fallback (for legacy passwords)
    let valid = false;
    const isBcrypt = user.password?.startsWith("$2");
    if (isBcrypt) {
      valid = await bcrypt.compare(password, user.password);
    } else {
      valid = user.password === password;
      if (valid) {
        // Upgrade to bcrypt hash
        const hashed = await bcrypt.hash(password, 10);
        await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [hashed, user.id]);
      }
    }

    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      permissions: user.permissions || [],
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Login failed" });
  }
});

// ─── ME ───────────────────────────────────────────────────────────────────────
router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "No token" });
    if (!requireDatabase(res)) return;
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number };
    const result = await pool.query(
      `SELECT id, name, email, role, is_active, permissions FROM users WHERE id = $1`,
      [decoded.id]
    );
    if (!result.rows.length) return res.status(401).json({ error: "User not found" });
    const u = result.rows[0];
    return res.json({ id: u.id, name: u.name, email: u.email, role: u.role, permissions: u.permissions || [] });
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
});

// ─── CHANGE PASSWORD ──────────────────────────────────────────────────────────
router.post("/change-password", async (req, res) => {
  try {
    const { userId, newPassword, requestedBy } = req.body;
    if (!userId || !newPassword) return res.status(400).json({ error: "userId and newPassword required" });
    if (!requireDatabase(res)) return;
    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [hashed, userId]);

    // Log notification
    await pool.query(
      `INSERT INTO notifications (type, title, message, recipient_role) VALUES ($1, $2, $3, $4)`,
      ["password_reset", "Password Reset", `Password reset for user ID ${userId} by ${requestedBy || "admin"}`, "ceo"]
    );
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to change password" });
  }
});

function createTransporter() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

// ─── FORGOT PASSWORD REQUEST ──────────────────────────────────────────────────
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });
    if (!requireDatabase(res)) return;

    const result = await pool.query(`SELECT id, name, email FROM users WHERE email = $1`, [email]);
    if (!result.rows.length) return res.status(404).json({ error: "No account found with that email" });
    const user = result.rows[0];

    const message = `${user.name} (${user.email}) has requested a password reset. Please update their password from User Management.`;

    // Web notifications for CEO and developer
    await pool.query(
      `INSERT INTO notifications (type, title, message, recipient_role) VALUES ($1,$2,$3,$4),($1,$2,$3,$5)`,
      ["forgot_password", "Password Reset Request", message, "ceo", "developer"]
    );

    const transporter = createTransporter();
    if (transporter) {
      const toList = [process.env.CEO_EMAIL || "junaid@alghani.pk"];
      try {
        await transporter.sendMail({
          from: `"Al Ghani ERP" <${process.env.SMTP_USER}>`,
          to: toList.join(", "),
          subject: "Al Ghani ERP Password Reset Request",
          text: message,
          html: `<p>${message}</p>`,
        });
      } catch (emailError) {
        console.error("[Auth] Forgot password email failed:", emailError);
      }
    }

    const telegramChatId = process.env.TELEGRAM_CHAT_ID;
    if (bot && telegramChatId) {
      try {
        await bot.sendMessage(
          telegramChatId,
          `🔐 *Password Reset Request*\n${message}`,
          { parse_mode: "Markdown" }
        );
      } catch (telegramError) {
        console.error("[Auth] Forgot password Telegram failed:", telegramError);
      }
    }

    return res.json({ success: true, message: "Your request has been sent to the administrator." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to process request" });
  }
});

export default router;
