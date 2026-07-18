import { Router } from "express";
import { db, purchasesTable } from "@workspace/db";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { round2 } from "../lib/ledger.js";

const router = Router();

interface PurchaseLineOccurrence {
  purchaseId: number;
  poNumber: string;
  purchaseDate: string;
  quantity: number;
  unitCost: number;
  total: number;
}

/**
 * GET /api/suppliers/:supplierId/price-history/:productId
 * Mirrors the customer-side price-history endpoint, but for purchases.
 * Rather than a separate append-only table, this is derived directly from
 * the `purchases.items` jsonb column so it also reflects purchases made
 * before this feature existed — no backfill/migration required.
 */
router.get("/:supplierId/price-history/:productId", async (req, res) => {
  try {
    const supplierId = parseInt(req.params.supplierId);
    const productId = parseInt(req.params.productId);
    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;

    const conditions: Array<any> = [eq(purchasesTable.supplierId, supplierId)];
    if (from) conditions.push(gte(purchasesTable.purchaseDate, from));
    if (to) conditions.push(lte(purchasesTable.purchaseDate, to));

    const purchases = await db
      .select()
      .from(purchasesTable)
      .where(and(...conditions))
      .orderBy(desc(purchasesTable.purchaseDate));

    const rows: PurchaseLineOccurrence[] = [];
    for (const purchase of purchases) {
      const items = (purchase.items as unknown as Array<Record<string, any>>) || [];
      for (const item of items) {
        if (Number(item.productId) === productId) {
          const quantity = Number(item.quantity ?? 0);
          const unitCost = Number(item.unitCost ?? 0);
          rows.push({
            purchaseId: purchase.id,
            poNumber: purchase.poNumber,
            purchaseDate: purchase.purchaseDate.toISOString(),
            quantity,
            unitCost,
            total: Number(item.total ?? quantity * unitCost),
          });
        }
      }
    }

    if (rows.length === 0) {
      return res.json({ hasHistory: false });
    }

    const last = rows[0];
    const daysSincePurchase = Math.floor((Date.now() - new Date(last.purchaseDate).getTime()) / (1000 * 60 * 60 * 24));

    const costs = rows.map((r) => r.unitCost);
    const totalQuantity = rows.reduce((sum, r) => sum + r.quantity, 0);
    const totalValue = rows.reduce((sum, r) => sum + r.total, 0);
    const averageCostPrice = costs.reduce((sum, c) => sum + c, 0) / costs.length;

    return res.json({
      hasHistory: true,
      lastCostPrice: round2(last.unitCost),
      lastPurchaseDate: last.purchaseDate,
      lastPoNumber: last.poNumber,
      lastQuantity: last.quantity,
      daysSincePurchase,
      previousPurchases: rows.slice(0, 100),
      lowestCostEver: round2(Math.min(...costs)),
      highestCostEver: round2(Math.max(...costs)),
      averageCostPrice: round2(averageCostPrice),
      totalQuantityPurchased: totalQuantity,
      totalPurchaseValue: round2(totalValue),
      totalOrders: rows.length,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch supplier price history" });
  }
});

export default router;
