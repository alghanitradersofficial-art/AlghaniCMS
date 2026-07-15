import { Router } from "express";
import { db } from "@workspace/db";
import { expensesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateExpenseBody, UpdateExpenseBody } from "@workspace/api-zod";
import { appendGeneralLedgerEntry } from "../lib/general-ledger.js";
import { isDateInClosedPeriod, MonthClosedError } from "../services/months.service.js";
import { getUserIdFromRequest } from "../lib/auth-context.js";
import { clearCachePrefix } from "../lib/dashboard-cache.js";

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

router.get("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    const [expense] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
    if (!expense) return res.status(404).json({ error: "Expense not found" });

    return res.json({
      ...expense,
      amount: parseFloat(expense.amount as string),
      createdAt: expense.createdAt.toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch expense" });
  }
});

router.post("/", async (req, res): Promise<any> => {
  try {
    const body = CreateExpenseBody.parse(req.body);
    const createdByUserId = getUserIdFromRequest(req);
    const expenseDate = body.date ? new Date(body.date) : new Date();
    if (await isDateInClosedPeriod(expenseDate)) {
      return res.status(409).json({ error: `Financial period is closed for ${expenseDate.toISOString().slice(0,10)}` });
    }
    // Loose inference alignment ke liye 'as any' use kiya
    const [expense] = await db.insert(expensesTable).values({
      ...body,
      amount: String(body.amount),
      createdByUserId,
    } as any).returning();

    await appendGeneralLedgerEntry(db as any, {
      date: body.date ? new Date(body.date) : new Date(),
      type: "expense",
      referenceId: expense.id,
      partyType: "none",
      amount: body.amount,
      direction: "debit",
      note: `${body.category}: ${body.title}`,
      createdByUserId,
    });

    return res.status(201).json({
      ...expense,
      amount: parseFloat(expense.amount as string),
      createdAt: expense.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("expense create failed", error);
    if (error instanceof MonthClosedError) return res.status(409).json({ error: error.message });
    return res.status(500).json({ error: "Failed to create expense" });
  }
});

router.patch("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    const body = UpdateExpenseBody.parse(req.body);
    const updateData: Record<string, unknown> = { ...body };
    if (body.amount !== undefined) updateData.amount = String(body.amount);
    // prevent updating expenses that fall in closed financial periods
    const [existing] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
    if (!existing) return res.status(404).json({ error: "Expense not found" });
    const effectiveDate = body.date ? new Date(body.date) : new Date(existing.createdAt);
    if (await isDateInClosedPeriod(effectiveDate)) {
      return res.status(409).json({ error: `Financial period is closed for ${effectiveDate.toISOString().slice(0,10)}` });
    }
    const [expense] = await db.update(expensesTable).set(updateData).where(eq(expensesTable.id, id)).returning();
    if (!expense) return res.status(404).json({ error: "Expense not found" });
    return res.json({
      ...expense,
      amount: parseFloat(expense.amount as string),
      createdAt: expense.createdAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof MonthClosedError) return res.status(409).json({ error: error.message });
    return res.status(500).json({ error: "Failed to update expense" });
  }
});

router.delete("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
    if (!existing) return res.status(404).json({ error: "Expense not found" });
    const effectiveDate = new Date(existing.createdAt);
    if (await isDateInClosedPeriod(effectiveDate)) {
      return res.status(409).json({ error: `Financial period is closed for ${effectiveDate.toISOString().slice(0,10)}` });
    }
    await db.delete(expensesTable).where(eq(expensesTable.id, id));
      // invalidate dashboard recent-activity cache so deleted expense doesn't reappear
      clearCachePrefix("dashboard:recent-activity");
    return res.status(204).send();
  } catch (error) {
    if (error instanceof MonthClosedError) return res.status(409).json({ error: error.message });
    return res.status(500).json({ error: "Failed to delete expense" });
  }
});

export default router;