import { Router } from "express";
import { db } from "@workspace/db";
import { expensesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateExpenseBody, UpdateExpenseBody } from "@workspace/api-zod";

const router = Router();

router.get("/", async (req, res): Promise<any> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(expensesTable);
    const total = Number(count);

    const rows = await db.select().from(expensesTable).limit(limit).offset(offset);
    return res.json({
      data: rows.map(r => ({
        ...r,
        amount: parseFloat(r.amount as string),
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

router.post("/", async (req, res): Promise<any> => {
  try {
    const body = CreateExpenseBody.parse(req.body);
    // Loose inference alignment ke liye 'as any' use kiya
    const [expense] = await db.insert(expensesTable).values({
      ...body,
      amount: String(body.amount),
    } as any).returning();
    return res.status(201).json({
      ...expense,
      amount: parseFloat(expense.amount as string),
      createdAt: expense.createdAt.toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create expense" });
  }
});

router.patch("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    const body = UpdateExpenseBody.parse(req.body);
    const updateData: Record<string, unknown> = { ...body };
    if (body.amount !== undefined) updateData.amount = String(body.amount);
    const [expense] = await db.update(expensesTable).set(updateData).where(eq(expensesTable.id, id)).returning();
    if (!expense) return res.status(404).json({ error: "Expense not found" });
    return res.json({
      ...expense,
      amount: parseFloat(expense.amount as string),
      createdAt: expense.createdAt.toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update expense" });
  }
});

router.delete("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(expensesTable).where(eq(expensesTable.id, id));
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete expense" });
  }
});

export default router;