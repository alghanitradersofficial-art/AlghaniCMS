import { Router } from "express";
import { z } from "zod";
import salesReturnsService from "../services/sales-returns.service.js";
import { MonthClosedError } from "../services/months.service.js";
import { getUserIdFromRequest } from "../lib/auth-context.js";
import { clearCachePrefix } from "../lib/dashboard-cache.js";

const router = Router();

function formatReturn(row: any) {
  return {
    ...row,
    subtotal: parseFloat(row.subtotal),
    total: parseFloat(row.total),
    items: row.items || [],
    returnDate: (row.returnDate instanceof Date ? row.returnDate : new Date(row.returnDate)).toISOString(),
    createdAt: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)).toISOString(),
  };
}

const bodySchema = z.object({
  saleId: z.number().int().positive().nullish(),
  customerId: z.number().int().positive().nullish(),
  customerName: z.string().optional(),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
  })).min(1),
  reason: z.string().nullish(),
  notes: z.string().nullish(),
  returnDate: z.string().optional(),
});

router.get("/", async (req, res) => {
  try {
    const result = await salesReturnsService.listSalesReturns(req.query as any);
    return res.json({ data: result.data.map(formatReturn), total: result.total, page: result.page, limit: result.limit });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch sale returns" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = bodySchema.parse(req.body);
    const actorUserId = getUserIdFromRequest(req);
    const row = await salesReturnsService.createSalesReturn(body, actorUserId);
    clearCachePrefix("dashboard:recent-activity");
    return res.status(201).json(formatReturn(row));
  } catch (error) {
    console.error("sale return create failed", error);
    if (error instanceof salesReturnsService.SaleReturnValidationError) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof MonthClosedError) {
      return res.status(409).json({ error: error.message });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request", details: error.issues });
    }
    return res.status(500).json({ error: "Failed to create sale return" });
  }
});

export default router;
