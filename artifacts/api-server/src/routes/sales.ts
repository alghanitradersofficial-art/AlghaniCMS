import { Router } from "express";
import { db, salesTable, productsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateSaleBody, UpdateSaleBody } from "@workspace/api-zod";
import { z } from "zod";
import salesService from "../services/sales.service.js";
import { getUserIdFromRequest } from "../lib/auth-context.js";

// Optional backdating field, layered on top of CreateSaleBody (see purchases.ts
// for the same pattern) so historical invoices can be entered with a real date.
const SaleDateExtension = z.object({ saleDate: z.string().optional() });

const router = Router();

function formatSale(sale: typeof salesTable.$inferSelect) {
  return {
    ...sale,
    subtotal: parseFloat(sale.subtotal as string),
    discount: parseFloat(sale.discount as string),
    total: parseFloat(sale.total as string),
    amountPaid: parseFloat((sale.amountPaid as string) ?? "0"),
    items: (sale.items as unknown[]) || [],
    saleDate: (sale.saleDate ?? sale.createdAt).toISOString(),
    createdAt: sale.createdAt.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function adjustSaleStock(sale: typeof salesTable.$inferSelect, delta: 1 | -1, client: any = db) {
  const items = (sale.items as unknown[]) || [];
  for (const item of items as Array<{ productId: number; quantity: number }>) {
    await client.update(productsTable).set({
      currentStock: sql`${productsTable.currentStock} + ${item.quantity * delta}`,
    }).where(eq(productsTable.id, item.productId));
  }
}

router.get("/", async (req, res) => {
  try {
    const result = await salesService.listSales(req.query as any);
    return res.json({ data: result.data.map(formatSale), total: result.total, page: result.page, limit: result.limit });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch sales" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = CreateSaleBody.parse(req.body);
    const actorUserId = getUserIdFromRequest(req);
    const sale = await salesService.createSale({ ...body, saleDate: (req.body as any).saleDate }, actorUserId);
    return res.status(201).json(formatSale(sale));
  } catch (error) {
    console.error(error);
    if (error instanceof Error && (error.message.includes("already closed") || error.message.includes("not found"))) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to create sale" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const sale = (await salesService.listSales({ id })).data?.[0] ?? null;
    if (!sale) return res.status(404).json({ error: "Sale not found" });
    return res.json(formatSale(sale));
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch sale" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = UpdateSaleBody.parse(req.body);
    const actorUserId = getUserIdFromRequest(req);
    await salesService.updateSale(id, body, actorUserId);
    const sale = (await salesService.listSales({ id })).data?.[0] ?? null;
    return res.json(formatSale(sale));
  } catch (error) {
    console.error(error);
    if (error instanceof Error && (error.message.includes("already closed") || error.message.includes("not found"))) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to update sale" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const actorUserId = getUserIdFromRequest(req);
    await salesService.deleteSale(id, actorUserId);
    res.status(204).send();
  } catch (error) {
    console.error(error);
    if (error instanceof Error && (error.message.includes("already closed") || error.message.includes("not found"))) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to delete sale" });
  }
});

export default router;
