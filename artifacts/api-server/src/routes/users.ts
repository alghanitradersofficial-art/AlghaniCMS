import { Router } from "express";
import { pool } from "@workspace/db";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const router = Router();

function parseJson(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function sanitizeUser(user: Record<string, unknown>) {
  const { password, photo_url, created_at, is_active, permissions, ...rest } = user;
  return {
    ...rest,
    cnic: user.cnic as string | null,
    address: user.address as string | null,
    photoUrl: photo_url as string | null,
    documents: parseJson(user.documents) as Array<{ url: string; name: string; type: string; publicId?: string }> | [],
    createdAt: created_at instanceof Date ? created_at.toISOString() : created_at,
    isActive: is_active,
    permissions: parseJson(permissions) as string[] || [],
  };
}

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`SELECT id, name, email, role, is_active, permissions, phone, cnic, address, photo_url, documents, created_at FROM users ORDER BY id`);
    return res.json(result.rows.map(sanitizeUser));
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = await pool.query(`SELECT id, name, email, role, is_active, permissions, phone, cnic, address, photo_url, documents, created_at FROM users WHERE id = $1`, [id]);
    if (!result.rows.length) return res.status(404).json({ error: "User not found" });
    return res.json(sanitizeUser(result.rows[0]));
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch user" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, email, role, password, phone, permissions, cnic, address, photoUrl, documents } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "name, email, password required" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const perms = permissions || [];
    const result = await pool.query(
      `INSERT INTO users (name, email, role, password, phone, permissions, cnic, address, photo_url, documents) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, name, email, role, is_active, permissions, phone, cnic, address, photo_url, documents, created_at`,
      [
        name,
        email.toLowerCase().trim(),
        role || "sales",
        hashedPassword,
        phone || null,
        JSON.stringify(perms),
        cnic || null,
        address || null,
        photoUrl || null,
        JSON.stringify(documents || []),
      ]
    );
    return res.status(201).json(sanitizeUser(result.rows[0]));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException & { code?: string }).code === "23505") return res.status(409).json({ error: "Email already exists" });
    console.error(error);
    return res.status(500).json({ error: "Failed to create user" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, role, isActive, is_active, phone, permissions, password, cnic, address, photoUrl, documents } = req.body;
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
    if (role !== undefined) { updates.push(`role = $${idx++}`); values.push(role); }
    const activeVal = isActive !== undefined ? isActive : is_active;
    if (activeVal !== undefined) { updates.push(`is_active = $${idx++}`); values.push(activeVal); }
    if (phone !== undefined) { updates.push(`phone = $${idx++}`); values.push(phone); }
    if (cnic !== undefined) { updates.push(`cnic = $${idx++}`); values.push(cnic); }
    if (address !== undefined) { updates.push(`address = $${idx++}`); values.push(address); }
    if (photoUrl !== undefined) { updates.push(`photo_url = $${idx++}`); values.push(photoUrl); }
    if (documents !== undefined) { updates.push(`documents = $${idx++}`); values.push(JSON.stringify(documents)); }
    if (permissions !== undefined) { updates.push(`permissions = $${idx++}`); values.push(JSON.stringify(permissions)); }
    if (password !== undefined && password !== "") {
      const hashed = await bcrypt.hash(password, 10);
      updates.push(`password = $${idx++}`); values.push(hashed);
    }

    if (updates.length === 0) return res.status(400).json({ error: "Nothing to update" });
    values.push(id);

    const result = await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${idx} RETURNING id, name, email, role, is_active, permissions, phone, cnic, address, photo_url, documents, created_at`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ error: "User not found" });
    return res.json(sanitizeUser(result.rows[0]));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to update user" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete user" });
  }
});

export default router;
