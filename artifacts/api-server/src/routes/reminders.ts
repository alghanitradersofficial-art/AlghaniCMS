import { Router } from "express";
import { db, remindersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { getUserIdFromRequest } from "../lib/auth-context.js";

const router = Router();

const bodySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string(),
  relatedType: z.string().optional(),
  relatedId: z.number().int().optional(),
  isCompleted: z.boolean().optional(),
});

function formatRow(row: typeof remindersTable.$inferSelect) {
  return {
    ...row,
    dueDate: row.dueDate.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/", async (_req, res) => {
  try {
    const rows = await db.select().from(remindersTable)
      .orderBy(sql`${remindersTable.dueDate} ASC`);
    return res.json({ data: rows.map(formatRow) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch reminders" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = bodySchema.parse(req.body);
    const createdByUserId = getUserIdFromRequest(req);
    const [row] = await db.insert(remindersTable).values({
      title: body.title,
      description: body.description ?? null,
      dueDate: new Date(body.dueDate),
      relatedType: body.relatedType ?? null,
      relatedId: body.relatedId ?? null,
      isCompleted: false,
      createdByUserId,
    }).returning();
    return res.status(201).json(formatRow(row));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create reminder" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = bodySchema.partial().parse(req.body);
    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.dueDate !== undefined) updateData.dueDate = new Date(body.dueDate);
    if (body.relatedType !== undefined) updateData.relatedType = body.relatedType;
    if (body.relatedId !== undefined) updateData.relatedId = body.relatedId;
    if (body.isCompleted !== undefined) updateData.isCompleted = body.isCompleted;

    const [row] = await db.update(remindersTable).set(updateData).where(eq(remindersTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Reminder not found" });
    return res.json(formatRow(row));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to update reminder" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(remindersTable).where(eq(remindersTable.id, id));
    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to delete reminder" });
  }
});

export default router;
