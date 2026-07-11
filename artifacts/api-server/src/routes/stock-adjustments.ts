import { Router } from "express";
import { z } from "zod";
import { getUserIdFromRequest } from "../lib/auth-context.js";
import inventoryService from "../services/inventory.service.js";

const router = Router();

const bodySchema = z.object({
  productId: z.number().int().positive(),
  direction: z.enum(["increase", "decrease"]),
  quantity: z.number().int().positive(),
  reason: z.string().min(1),
  notes: z.string().optional(),
});

router.get("/", async (req, res) => {
  try {
    const search = (req.query.search as string) || "";
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await inventoryService.listStockAdjustments({ search, page, limit });
    return res.json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch stock adjustments" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = bodySchema.parse(req.body);
    const createdByUserId = getUserIdFromRequest(req);
    const row = await inventoryService.adjustStock({
      productId: body.productId,
      direction: body.direction,
      quantity: body.quantity,
      reason: body.reason,
      notes: body.notes ?? null,
      performedByUserId: createdByUserId,
    });
    return res.status(201).json(row);
  } catch (error) {
    console.error(error);
    if (error.message === "Product not found") return res.status(404).json({ error: "Product not found" });
    return res.status(500).json({ error: "Failed to create stock adjustment" });
  }
});

export default router;
