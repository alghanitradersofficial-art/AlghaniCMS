import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const role = (req.query.role as string) || "ceo";
    const result = await pool.query(
      `SELECT * FROM notifications WHERE recipient_role = $1 OR recipient_role = 'all' ORDER BY created_at DESC LIMIT 50`,
      [role]
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

router.patch("/:id/read", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await pool.query(`UPDATE notifications SET is_read = true WHERE id = $1`, [id]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to mark read" });
  }
});

router.patch("/read-all", async (req, res) => {
  try {
    const role = (req.body.role as string) || "ceo";
    await pool.query(`UPDATE notifications SET is_read = true WHERE recipient_role = $1 OR recipient_role = 'all'`, [role]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to mark all read" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await pool.query(`DELETE FROM notifications WHERE id = $1`, [id]);
    res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete notification" });
  }
});

export default router;
