import { Router } from "express";
import { db } from "@workspace/db";
import { stockAdjustmentsTable, productsTable } from "@workspace/db";
import { eq, sql, and, ilike } from "drizzle-orm";
import { z } from "zod";
import { getUserIdFromRequest } from "../lib/auth-context.js";

const router = Router();

const bodySchema = z.object({
  productId: z.number().int().positive(),
  direction: z.enum(["increase", "decrease"]),
  quantity: z.number().int().positive(),
  reason: z.string().min(1),
  notes: z.string().optional(),
});

function formatRow(row: typeof stockAdjustmentsTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/", async (req, res) => {
  try {
    const search = (req.query.search as string) || "";
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const conditions = [] as ReturnType<typeof and>[];
    if (search) {
      conditions.push(ilike(productsTable.name, `%${search}%`));
    }

    const baseQuery = db.select({
      id: stockAdjustmentsTable.id,
      productId: stockAdjustmentsTable.productId,
      direction: stockAdjustmentsTable.direction,
      quantity: stockAdjustmentsTable.quantity,
      reason: stockAdjustmentsTable.reason,
      notes: stockAdjustmentsTable.notes,
      createdByUserId: stockAdjustmentsTable.createdByUserId,
      createdAt: stockAdjustmentsTable.createdAt,
      productName: productsTable.name,
    }).from(stockAdjustmentsTable)
      .leftJoin(productsTable, eq(stockAdjustmentsTable.productId, productsTable.id));

    const rows = await (conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery)
      .orderBy(sql`${stockAdjustmentsTable.createdAt} DESC`)
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(stockAdjustmentsTable)
      .leftJoin(productsTable, eq(stockAdjustmentsTable.productId, productsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return res.json({ data: rows.map((row) => ({ ...formatRow(row as typeof stockAdjustmentsTable.$inferSelect), productName: row.productName })), total: Number(count), page, limit });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch stock adjustments" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = bodySchema.parse(req.body);
    const createdByUserId = getUserIdFromRequest(req);
    const delta = body.direction === "increase" ? body.quantity : -body.quantity;

    const [product] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.id, body.productId));
    if (!product) return res.status(404).json({ error: "Product not found" });

    const [row] = await db.transaction(async (tx) => {
      await tx.update(productsTable).set({
        currentStock: sql`${productsTable.currentStock} + ${delta}`,
      }).where(eq(productsTable.id, body.productId));

      return tx.insert(stockAdjustmentsTable).values({
        productId: body.productId,
        direction: body.direction,
        quantity: body.quantity,
        reason: body.reason,
        notes: body.notes ?? null,
        createdByUserId,
      }).returning();
    });

    return res.status(201).json(formatRow(row));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create stock adjustment" });
  }
});

export default router;
