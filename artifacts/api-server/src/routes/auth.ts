import { Router } from "express";
import { pool } from "@workspace/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
const JWT_EXPIRES = "30d";

// ─── LOGIN ────────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

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

// ─── FORGOT PASSWORD REQUEST ──────────────────────────────────────────────────
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const result = await pool.query(`SELECT id, name, email FROM users WHERE email = $1`, [email]);
    if (!result.rows.length) return res.status(404).json({ error: "No account found with that email" });
    const user = result.rows[0];

    // Notify CEO and developer
    await pool.query(
      `INSERT INTO notifications (type, title, message, recipient_role) VALUES ($1,$2,$3,$4),($1,$2,$3,$5)`,
      ["forgot_password", "Password Reset Request",
        `${user.name} (${user.email}) has requested a password reset. Please update their password from User Management.`,
        "ceo", "developer"]
    );
    return res.json({ success: true, message: "Your request has been sent to the administrator." });
  } catch (error) {
    return res.status(500).json({ error: "Failed to process request" });
  }
});

export default router;
