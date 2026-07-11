import { Router } from "express";
import { db, purchasesTable, productsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreatePurchaseBody, UpdatePurchaseBody } from "@workspace/api-zod";
import { z } from "zod";
import purchasesService from "../services/purchases.service.js";
import { getUserIdFromRequest } from "../lib/auth-context.js";

const router = Router();

// Optional backdating field, layered on top of the generated CreatePurchaseBody
// (not yet part of the OpenAPI spec) so old purchase records can be entered
// with a real historical date instead of always defaulting to "now".
const PurchaseDateExtension = z.object({ purchaseDate: z.string().optional() });

function formatPurchase(p: typeof purchasesTable.$inferSelect) {
  return {
    ...p,
    subtotal: parseFloat(p.subtotal as string),
    total: parseFloat(p.total as string),
    amountPaid: parseFloat((p.amountPaid ?? "0") as string),
    items: (p.items as unknown[]) || [],
    purchaseDate: (p.purchaseDate ?? p.createdAt).toISOString(),
    createdAt: p.createdAt.toISOString(),
  };
}

async function adjustPurchaseStock(purchase: typeof purchasesTable.$inferSelect, delta: 1 | -1) {
  const items = (purchase.items as unknown[]) || [];
  for (const item of items as Array<{ productId: number; quantity: number }>) {
    await db.update(productsTable).set({
      currentStock: sql`${productsTable.currentStock} + ${item.quantity * delta}`,
    }).where(eq(productsTable.id, item.productId));
  }
}

router.get("/", async (req, res) => {
  try {
    const result = await purchasesService.listPurchases(req.query as any);
    return res.json({ data: result.data.map(formatPurchase), total: result.total, page: result.page, limit: result.limit });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch purchases" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = CreatePurchaseBody.parse(req.body);
    const actorUserId = getUserIdFromRequest(req);
    const purchase = await purchasesService.createPurchase({ ...body, purchaseDate: (req.body as any).purchaseDate }, actorUserId);
    return res.status(201).json(formatPurchase(purchase));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create purchase" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const purchase = (await purchasesService.listPurchases({ id })).data?.[0] ?? null;
    if (!purchase) return res.status(404).json({ error: "Purchase not found" });
    return res.json(formatPurchase(purchase));
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch purchase" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = UpdatePurchaseBody.parse(req.body);
    const actorUserId = getUserIdFromRequest(req);
    const purchase = await purchasesService.updatePurchase(id, body, actorUserId);
    return res.json(formatPurchase(purchase));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to update purchase" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const actorUserId = getUserIdFromRequest(req);
    await purchasesService.deletePurchase(id, actorUserId);
    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to delete purchase" });
  }
});

export default router;
