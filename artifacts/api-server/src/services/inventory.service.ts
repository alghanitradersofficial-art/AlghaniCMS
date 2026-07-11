import { db } from "@workspace/db";
import { stockAdjustmentsTable, productsTable } from "@workspace/db";
import { eq, sql, and, ilike } from "drizzle-orm";
import ledgerService from "./ledger.service.js";

export type ListStockOptions = { search?: string; page?: number; limit?: number };

export async function listStockAdjustments(opts: ListStockOptions) {
  const search = opts.search || "";
  const page = opts.page && opts.page > 0 ? opts.page : 1;
  const limit = opts.limit && opts.limit > 0 ? opts.limit : 20;
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

  return {
    data: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), productName: row.productName })),
    total: Number(count),
    page,
    limit,
  };
}

export async function adjustStock(params: { productId: number; direction: "increase" | "decrease"; quantity: number; reason: string; notes?: string | null; performedByUserId?: number | null }) {
  const { productId, direction, quantity, reason, notes, performedByUserId } = params;
  const delta = direction === "increase" ? quantity : -quantity;

  const [product] = await db.select({ id: productsTable.id, name: productsTable.name }).from(productsTable).where(eq(productsTable.id, productId));
  if (!product) throw new Error("Product not found");

  const [row] = await db.transaction(async (tx) => {
    await tx.update(productsTable).set({
      currentStock: sql`${productsTable.currentStock} + ${delta}`,
    }).where(eq(productsTable.id, productId));

    return tx.insert(stockAdjustmentsTable).values({
      productId,
      direction,
      quantity,
      reason,
      notes: notes ?? null,
      createdByUserId: performedByUserId ?? null,
    }).returning();
  });

  // Record a general ledger entry for traceability (amount=0 for stock-only adjustments)
  try {
    await ledgerService.recordEntry({
      type: "stock_adjustment",
      referenceId: row.id,
      partyType: "product",
      partyId: productId,
      partyName: product.name ?? null,
      amount: 0,
      direction: "debit",
      note: `Stock ${direction} ${quantity} for product ${productId}: ${reason}`,
    });
  } catch (err) {
    console.warn("Failed to write general ledger entry for stock adjustment", err);
  }

  return { ...row, createdAt: row.createdAt.toISOString() };
}

export default { listStockAdjustments, adjustStock };
