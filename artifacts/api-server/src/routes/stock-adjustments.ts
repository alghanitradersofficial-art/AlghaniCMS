import { Router } from "express";
import { z } from "zod";
import { getUserIdFromRequest } from "../lib/auth-context.js";
import inventoryService from "../services/inventory.service.js";
import { logger } from "../lib/logger.js";

const router = Router();

const bodySchema = z.object({
  productId: z.number().int().positive(),
  direction: z.enum(["increase", "decrease"]),
  quantity: z.number().int().positive(),
  reason: z.string().min(1),
  notes: z.string().optional(),
  date: z.string().datetime().optional(),
});

router.get("/", async (req, res) => {
  try {
    const search = (req.query.search as string) || "";
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await inventoryService.listStockAdjustments({ search, page, limit });
    return res.json(result);
  } catch (error) {
    logger.error({ err: error }, "Failed to list stock adjustments");
    return res.status(500).json({ error: "Failed to list stock adjustments" });
  }
});

router.post("/", async (req, res): Promise<any> => {
  try {
    const body = bodySchema.parse(req.body);
    const createdByUserId = getUserIdFromRequest(req);
    const row = await inventoryService.adjustStock({
      productId: body.productId,
      direction: body.direction,
      quantity: body.quantity,
      reason: body.reason,
      notes: body.notes ?? null,
      date: body.date ? new Date(body.date) : undefined,
      performedByUserId: createdByUserId,
    });
    return res.status(201).json(row);
  } catch (error) {
    logger.error({ err: error }, "Failed to create stock adjustment");
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid stock adjustment payload", details: error.issues });
    }
    if (error instanceof Error && error.message === "Product not found") return res.status(404).json({ error: "Product not found" });
    // Previously this silently returned a fake success payload ({id: 0, ...})
    // with a 200 status, so the frontend thought the adjustment worked even
    // when it hadn't been saved at all. Report the real failure instead.
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create stock adjustment" });
  }
});

export default router;
