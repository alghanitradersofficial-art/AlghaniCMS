import { Router } from "express";
import { z } from "zod";
import { db, cashEntriesTable } from "@workspace/db";
import { and, gte, lte, desc, eq } from "drizzle-orm";
import { getUserIdFromRequest } from "../lib/auth-context.js";

const router = Router();

const CreateCashEntryBody = z.object({
  amount: z.number().positive(),
  entryDate: z.string().min(1), // YYYY-MM-DD
  note: z.string().optional(),
});

function fmt(row: typeof cashEntriesTable.$inferSelect) {
  return {
    id: row.id,
    amount: parseFloat(row.amount as string),
    entryDate: row.entryDate,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

// GET /api/cash-entries?from=YYYY-MM-DD&to=YYYY-MM-DD
// Plain manual history — no auto-calculation from sales/purchases/expenses.
router.get("/", async (req, res): Promise<any> => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const conditions = [];
    if (from) conditions.push(gte(cashEntriesTable.entryDate, from));
    if (to) conditions.push(lte(cashEntriesTable.entryDate, to));

    const rows = await db
      .select()
      .from(cashEntriesTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(cashEntriesTable.entryDate), desc(cashEntriesTable.id));

    const total = rows.reduce((sum, r) => sum + parseFloat(r.amount as string), 0);

    return res.json({
      data: rows.map(fmt),
      total: Math.round(total * 100) / 100,
      count: rows.length,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch cash entries" });
  }
});

// POST /api/cash-entries — add one manual cash entry.
router.post("/", async (req, res): Promise<any> => {
  try {
    const body = CreateCashEntryBody.parse(req.body);
    const createdByUserId = getUserIdFromRequest(req);
    const [row] = await db
      .insert(cashEntriesTable)
      .values({
        amount: String(body.amount),
        entryDate: body.entryDate,
        note: body.note ?? null,
        createdByUserId,
      })
      .returning();
    return res.status(201).json(fmt(row));
  } catch (error) {
    console.error("cash entry create failed", error);
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues });
    return res.status(500).json({ error: "Failed to add cash entry" });
  }
});

// DELETE /api/cash-entries/:id — remove a manual entry (e.g. entered by mistake).
router.delete("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(cashEntriesTable).where(eq(cashEntriesTable.id, id));
    if (!existing) return res.status(404).json({ error: "Cash entry not found" });
    await db.delete(cashEntriesTable).where(eq(cashEntriesTable.id, id));
    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to delete cash entry" });
  }
});

export default router;
