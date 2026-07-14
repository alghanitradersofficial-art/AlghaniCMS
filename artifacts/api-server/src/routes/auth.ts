import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import rateLimit from "express-rate-limit";
import { validatePassword, getRequestMetadata, createSecureToken, hashToken } from "../lib/security.js";
import { pool } from "@workspace/db";
import { bot } from "./telegram.js";
import { logger } from "../lib/logger.js";
import { authenticate, requireRole } from "../lib/auth-middleware.js";

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again later." },
});

router.use(authLimiter);

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    logger.error("JWT_SECRET is required in production. Authentication will fail until it is configured.");
  } else {
    logger.warn("JWT_SECRET is not configured; using a development-only fallback secret.");
  }
}
const JWT_SECRET_VALUE = JWT_SECRET || (process.env.NODE_ENV !== "production" ? "dev-only-secret" : "");
const JWT_EXPIRES = "30d";

function requireDatabase(res: any) {
  const hasQueryMethod = typeof (pool as any)?.query === "function";
  if (!hasQueryMethod) {
    logger.error({ poolType: typeof pool }, "Auth route encountered a missing database pool");
    res.status(503).json({ error: "Database unavailable" });
    return false;
  }
  return true;
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    if (!requireDatabase(res)) return;

    const result = await pool.query(
      `SELECT id, name, email, role, password, is_active, permissions FROM users WHERE email = $1`,
      [email]
    );
    if (!result.rows.length) return res.status(401).json({ error: "Invalid credentials" });

    const user = result.rows[0];
    if (!user.is_active) return res.status(403).json({ error: "Account is disabled" });

    let valid = false;
    const isBcrypt = typeof user.password === "string" && user.password.startsWith("$2");
    if (isBcrypt) {
      valid = await bcrypt.compare(password, user.password);
    } else {
      valid = false;
    }

    if (!valid) {
      const metadata = getRequestMetadata(req);
      await pool.query(
        `INSERT INTO audit_log (entity_type, entity_id, action, reason, performed_by_user_id, ip_address) VALUES ($1, $2, $3, $4, $5, $6)`,
        ["auth", user.id, "failed_login", "Invalid credentials", user.id, metadata.ipAddress]
      );
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!JWT_SECRET_VALUE) {
      return res.status(500).json({ error: "Authentication is not configured on this server." });
    }

    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      permissions: user.permissions || [],
    };
    const token = jwt.sign(payload, JWT_SECRET_VALUE, { expiresIn: JWT_EXPIRES });
    const refreshToken = createSecureToken(48);
    const metadata = getRequestMetadata(req);
    await pool.query(
      `INSERT INTO audit_log (entity_type, entity_id, action, reason, performed_by_user_id, ip_address) VALUES ($1, $2, $3, $4, $5, $6)`,
      ["auth", user.id, "login", "Successful login", user.id, metadata.ipAddress]
    );

    const recentFailures = await pool.query(
      `SELECT id FROM audit_log WHERE entity_type = 'auth' AND action = 'failed_login' AND performed_by_user_id = $1 AND created_at >= NOW() - INTERVAL '15 minutes'`,
      [user.id]
    );
    const knownSessions = await pool.query(
      `SELECT ip_address FROM user_sessions WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
      [user.id]
    );
    const knownIps = new Set(knownSessions.rows.map((row: any) => row.ip_address).filter(Boolean));
    const isHighRisk = recentFailures.rows.length >= 3 || (knownIps.size > 0 && !knownIps.has(metadata.ipAddress));
    if (isHighRisk) {
      await sendSecurityAlert(user, req, recentFailures.rows.length >= 3 ? "Repeated failed sign-in attempts" : "Login from a new IP address");
    }
    await pool.query(
      `INSERT INTO user_sessions (user_id, token_hash, refresh_token_hash, created_at, expires_at, last_seen_at, user_agent, ip_address) VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '30 days', NOW(), $4, $5)`,
      [user.id, hashToken(token), hashToken(refreshToken), getRequestMetadata(req).userAgent, getRequestMetadata(req).ipAddress]
    );

    return res.json({
      token,
      refreshToken,
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

// ─── REFRESH TOKEN ─────────────────────────────────────────────────────────
router.post("/refresh", async (req, res) => {
  try {
    const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
    if (!refreshToken) return res.status(400).json({ error: "Refresh token required" });
    if (!requireDatabase(res)) return;
    if (!JWT_SECRET_VALUE) return res.status(500).json({ error: "Authentication is not configured on this server." });

    const refreshHash = hashToken(refreshToken);
    const sessionResult = await pool.query(
      `SELECT id, user_id, expires_at FROM user_sessions WHERE refresh_token_hash = $1 ORDER BY id DESC LIMIT 1`,
      [refreshHash]
    );
    if (!sessionResult.rows.length) return res.status(401).json({ error: "Invalid refresh token" });

    const session = sessionResult.rows[0];
    if (new Date(session.expires_at) < new Date()) return res.status(401).json({ error: "Refresh token expired" });

    const userResult = await pool.query(
      `SELECT id, name, email, role, is_active, permissions FROM users WHERE id = $1`,
      [session.user_id]
    );
    if (!userResult.rows.length || !userResult.rows[0].is_active) return res.status(401).json({ error: "User not active" });

    const user = userResult.rows[0];
    const payload = { id: user.id, email: user.email, role: user.role, name: user.name, permissions: user.permissions || [] };
    const token = jwt.sign(payload, JWT_SECRET_VALUE, { expiresIn: "15m" });
    const rotatedRefreshToken = createSecureToken(48);
    await pool.query(
      `UPDATE user_sessions SET token_hash = $1, refresh_token_hash = $2, last_seen_at = NOW(), expires_at = NOW() + INTERVAL '30 days' WHERE id = $3`,
      [hashToken(token), hashToken(rotatedRefreshToken), session.id]
    );
    return res.json({ token, refreshToken: rotatedRefreshToken, user: { id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.permissions || [] } });
  } catch (error) {
    logger.warn({ err: error }, "Refresh token failed");
    return res.status(401).json({ error: "Invalid refresh token" });
  }
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
router.post("/logout", async (req, res) => {
  try {
    const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
    if (!refreshToken) return res.status(400).json({ error: "Refresh token required" });
    if (!requireDatabase(res)) return;
    await pool.query(`DELETE FROM user_sessions WHERE refresh_token_hash = $1`, [hashToken(refreshToken)]);
    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, "Logout failed");
    return res.status(500).json({ error: "Logout failed" });
  }
});

router.post("/logout-all", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "No token" });
    if (!requireDatabase(res)) return;
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET_VALUE) as { id: number };
    await pool.query(`DELETE FROM user_sessions WHERE user_id = $1`, [decoded.id]);
    return res.json({ success: true });
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
});

router.post("/logout-others", authenticate, async (req, res) => {
  try {
    if (!req.auth?.id) return res.status(401).json({ error: "Unauthorized" });
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "No token" });

    const tokenHash = hashToken(token);
    await pool.query(`DELETE FROM user_sessions WHERE user_id = $1 AND token_hash <> $2`, [req.auth.id, tokenHash]);
    return res.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, "Logout others failed");
    return res.status(500).json({ error: "Failed to log out other sessions" });
  }
});

router.get("/security-summary", authenticate, async (req, res) => {
  try {
    if (!req.auth?.id) return res.status(401).json({ error: "Unauthorized" });
    const userId = req.auth.id;

    const sessionsResult = await pool.query(
      `SELECT id, user_agent, ip_address, created_at, last_seen_at, expires_at FROM user_sessions WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 5`,
      [userId]
    );
    const auditResult = await pool.query(
      `SELECT action, reason, ip_address, created_at FROM audit_log WHERE performed_by_user_id = $1 AND entity_type = 'auth' ORDER BY created_at DESC LIMIT 12`,
      [userId]
    );

    const alerts: Array<{ type: string; severity: string; message: string }> = [];
    const failedAttempts = auditResult.rows.filter((row: any) => row.action === "failed_login" && new Date(row.created_at) >= new Date(Date.now() - 15 * 60 * 1000));
    if (failedAttempts.length >= 3) {
      alerts.push({ type: "multiple_failed_logins", severity: "high", message: `${failedAttempts.length} failed login attempts were detected recently.` });
    }

    const distinctIps = new Set(sessionsResult.rows.map((row: any) => row.ip_address).filter(Boolean));
    if (distinctIps.size > 1) {
      alerts.push({ type: "multiple_locations", severity: "medium", message: "Recent sessions appear to come from multiple IP addresses." });
    }

    const recentLogins = auditResult.rows.filter((row: any) => row.action === "login").slice(0, 5);

    return res.json({
      sessions: sessionsResult.rows.map((row: any) => ({
        id: row.id,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
        expiresAt: row.expires_at,
      })),
      recentLogins: recentLogins.map((row: any) => ({
        action: row.action,
        reason: row.reason,
        ipAddress: row.ip_address,
        createdAt: row.created_at,
      })),
      alerts,
    });
  } catch (error) {
    logger.warn({ err: error }, "Security summary request failed");
    return res.status(500).json({ error: "Failed to load security summary" });
  }
});

// ─── ME ───────────────────────────────────────────────────────────────────────
router.get("/security-feed", authenticate, requireRole(["developer", "ceo"]), async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.action, a.reason, a.ip_address, a.created_at, u.name, u.email, u.role
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.performed_by_user_id
       WHERE a.entity_type = 'auth' AND (a.action = 'failed_login' OR a.action = 'login' OR a.reason ILIKE '%risk%' OR a.reason ILIKE '%suspicious%')
       ORDER BY a.created_at DESC LIMIT 50`,
    );

    return res.json(
      result.rows.map((row: any) => ({
        id: row.id,
        user: row.name ? `${row.name} (${row.email})` : "Unknown user",
        role: row.role || "unknown",
        action: row.action,
        reason: row.reason,
        ipAddress: row.ip_address,
        createdAt: row.created_at,
        severity: row.action === "failed_login" ? "high" : "medium",
      }))
    );
  } catch (error) {
    logger.warn({ err: error }, "Security feed request failed");
    return res.status(500).json({ error: "Failed to load security feed" });
  }
});

router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "No token" });
    if (!requireDatabase(res)) return;
    if (!JWT_SECRET_VALUE) return res.status(500).json({ error: "Authentication is not configured on this server." });
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET_VALUE) as { id: number };
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
    const passwordPolicy = validatePassword(String(newPassword));
    if (!passwordPolicy.valid) return res.status(400).json({ error: passwordPolicy.reason });
    const hashed = await bcrypt.hash(String(newPassword), 12);
    await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [hashed, userId]);
    await pool.query(`INSERT INTO audit_log (entity_type, entity_id, action, reason, performed_by_user_id, ip_address) VALUES ($1, $2, $3, $4, $5, $6)`, ["auth", userId, "password_change", "Password changed", userId, getRequestMetadata(req).ipAddress]);

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

async function sendSecurityAlert(user: { id: number; name: string; email: string; role?: string }, req: any, reason: string) {
  try {
    const metadata = getRequestMetadata(req);
    const message = `🚨 High-risk login detected\nUser: ${user.name} (${user.email})\nRole: ${user.role || "unknown"}\nIP: ${metadata.ipAddress}\nUser Agent: ${metadata.userAgent || "unknown"}\nReason: ${reason}`;

    await pool.query(
      `INSERT INTO notifications (type, title, message, recipient_role) VALUES ($1, $2, $3, $4), ($1, $2, $3, $5)`,
      ["security_alert", "High-risk login detected", message, "ceo", "developer"]
    );

    const transporter = createTransporter();
    if (transporter) {
      const toList = process.env.CEO_EMAIL ? [process.env.CEO_EMAIL] : (process.env.SMTP_USER ? [process.env.SMTP_USER] : []);
      if (toList.length) {
        await transporter.sendMail({
          from: `"Al Ghani ERP" <${process.env.SMTP_USER}>`,
          to: toList.join(", "),
          subject: "High-risk login detected",
          text: message,
          html: `<p>${message.replace(/\n/g, "<br/>")}</p>`,
        });
      } else {
        logger.warn("No email recipients configured for security alert; set CEO_EMAIL or SMTP_USER in env");
      }
    }

    const telegramChatId = process.env.TELEGRAM_CHAT_ID;
    if (bot && telegramChatId) {
      await bot.sendMessage(telegramChatId, message, { parse_mode: "Markdown" });
    }
  } catch (error) {
    logger.warn({ err: error }, "Failed to deliver security alert");
  }
}

// ─── FORGOT PASSWORD REQUEST ──────────────────────────────────────────────────
router.post("/forgot-password", async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
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
      const toList = process.env.CEO_EMAIL ? [process.env.CEO_EMAIL] : (process.env.SMTP_USER ? [process.env.SMTP_USER] : []);
      if (toList.length) {
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
      } else {
        logger.warn("No email recipients configured for forgot-password notifications; set CEO_EMAIL or SMTP_USER in env");
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
