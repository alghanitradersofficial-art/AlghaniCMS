import { Router } from "express";
import { db, salesTable, productsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateSaleBody, UpdateSaleBody } from "@workspace/api-zod";
import { z } from "zod";
import salesService from "../services/sales.service.js";
import { MonthClosedError } from "../services/months.service.js";
import { getUserIdFromRequest } from "../lib/auth-context.js";
import { clearCachePrefix } from "../lib/dashboard-cache.js";

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
    const sale = await salesService.createSale({
      ...body,
      saleDate: (req.body as any).saleDate,
      // Cash received at the counter right now (khata customers only —
      // walk-in sales are always treated as fully paid). Not yet part of
      // the generated OpenAPI schema, so read straight off the raw body.
      amountReceived: (req.body as any).amountReceived,
      paymentMethod: (req.body as any).paymentMethod,
    }, actorUserId);
    return res.status(201).json(formatSale(sale));
  } catch (error) {
    console.error("sale create failed", error);
    if (error instanceof salesService.InsufficientStockError) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof MonthClosedError) {
      return res.status(409).json({ error: error.message });
    }
    if ((error as NodeJS.ErrnoException & { code?: string }).code === "23505") {
      return res.status(409).json({ error: `Invoice number "${(req.body as any)?.invoiceNumber}" is already in use — please choose a different one.` });
    }
    return res.status(500).json({ error: "Failed to create sale" });
  }
});

router.get("/summary", async (req, res) => {
  try {
    const summary = await salesService.getSalesSummary(req.query as any);
    return res.json(summary);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch sales summary" });
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
    if (error instanceof salesService.InsufficientStockError) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof MonthClosedError) {
      return res.status(409).json({ error: error.message });
    }
    if (error instanceof Error && error.message.startsWith("Cannot void")) {
      return res.status(409).json({ error: error.message });
    }
    if ((error as NodeJS.ErrnoException & { code?: string }).code === "23505") {
      return res.status(409).json({ error: `Invoice number "${(req.body as any)?.invoiceNumber}" is already in use — please choose a different one.` });
    }
    return res.status(500).json({ error: "Failed to update sale" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const actorUserId = getUserIdFromRequest(req);
    await salesService.deleteSale(id, actorUserId);
    // invalidate dashboard recent-activity cache so deleted item doesn't reappear
    clearCachePrefix("dashboard:recent-activity");
    res.status(204).send();
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    if (error instanceof MonthClosedError) {
      return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to delete sale", details: message });
  }
});

// POST /api/sales/:id/void - safer flow: mark sale void (restores stock + appends adjustment ledger entry)
router.post("/:id/void", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const actorUserId = getUserIdFromRequest(req);
    await salesService.updateSale(id, { status: 'void' }, actorUserId as any);
    // invalidate dashboard recent-activity cache so voided item doesn't appear
    clearCachePrefix("dashboard:recent-activity");
    return res.status(200).send();
  } catch (err) {
    console.error(err);
    if (err instanceof MonthClosedError) {
      return res.status(409).json({ error: err.message });
    }
    if (err instanceof Error && err.message.startsWith("Cannot void")) {
      return res.status(409).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Failed to void sale' });
  }
});

export default router;
