import { Router } from "express";
import { z } from "zod";
import { CreateProductBody, UpdateProductBody, GetProductsQueryParams } from "@workspace/api-zod";
import productsService from "../services/products.service.js";
import { getUserIdFromRequest } from "../lib/auth-context.js";
import { logger } from "../lib/logger.js";

const router = Router();

const BulkPriceUpdateBody = z.object({
  updates: z
    .array(
      z.object({
        id: z.number().int().positive(),
        costPrice: z.number().positive().optional(),
        salePrice: z.number().positive().optional(),
        // e.g. 10 = +10%, -5 = -5%. Applied to the product's current sale price.
        salePricePercentAdjust: z.number().optional(),
      }),
    )
    .min(1),
});

// GET /api/products
router.get("/", async (req, res): Promise<any> => {
  try {
    const params = GetProductsQueryParams.parse(req.query);
    const result = await productsService.listProducts(params as Record<string, unknown>);
    return res.json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch products" });
  }
});

// POST /api/products
router.post("/", async (req, res): Promise<any> => {
  try {
    const body = CreateProductBody.parse(req.body) as any;
    const actorUserId = getUserIdFromRequest(req);
    const product = await productsService.createProduct(body, actorUserId);
    return res.status(201).json(product);
  } catch (error) {
    console.error("product create failed", error);
    return res.status(500).json({ error: "Failed to create product" });
  }
});

// GET /api/products/low-stock — alias for GET /api/products?lowStock=true.
// Must be declared before GET /:id below, or Express would treat
// "low-stock" as an :id value and this route would never be reached.
router.get("/low-stock", async (req, res): Promise<any> => {
  try {
    const params = GetProductsQueryParams.parse({ ...req.query, lowStock: "true" });
    const result = await productsService.listProducts(params as Record<string, unknown>);
    return res.json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch low-stock products" });
  }
});

// POST /api/products/bulk-price-update — update cost/sale price (fixed value
// or a % adjustment) for many products in one request. Must be declared
// before GET/PATCH /:id below so "bulk-price-update" isn't swallowed as an id.
router.post("/bulk-price-update", async (req, res): Promise<any> => {
  try {
    const body = BulkPriceUpdateBody.parse(req.body);
    const actorUserId = getUserIdFromRequest(req);
    const result = await productsService.bulkUpdatePrices(body.updates, actorUserId);
    return res.json(result);
  } catch (error) {
    logger.error({ err: error }, "Bulk price update failed");
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid payload", details: error.issues });
    return res.status(500).json({ error: "Failed to bulk update prices" });
  }
});

// GET /api/products/:id
router.get("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    const product = await productsService.getProduct(id);
    if (!product) return res.status(404).json({ error: "Product not found" });
    return res.json(product);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch product" });
  }
});

// PATCH /api/products/:id
router.patch("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    const body = UpdateProductBody.parse(req.body) as any;
    const actorUserId = getUserIdFromRequest(req);
    const product = await productsService.updateProduct(id, body, actorUserId);
    if (!product) return res.status(404).json({ error: "Product not found" });
    return res.json(product);
  } catch (error) {
    return res.status(500).json({ error: "Failed to update product" });
  }
});

// DELETE /api/products/:id
router.delete("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    const actorUserId = getUserIdFromRequest(req);
    await productsService.deleteProduct(id, actorUserId);
    return res.status(204).send();
  } catch (error) {
    console.error(error);
    // Detect Postgres foreign-key violation (references preventing delete)
    const pgCode = (error as any)?.code;
    if (pgCode === "23503") {
      return res.status(409).json({ error: "Product cannot be deleted because it is referenced by other records", details: (error as any)?.detail ?? null });
    }
    // Application-level reference check
    if ((error as any)?.code === "REFERENCED") {
      return res.status(409).json({ error: "Product cannot be deleted because it is referenced by other records", details: (error as any)?.detail ?? null });
    }
    // Cloudinary cleanup failure - propagate clearer message
    if ((error as any)?.message === "Failed to delete product image before product removal") {
      const body: any = { error: (error as any).message };
      if (process.env.NODE_ENV !== "production") { body.detail = (error as any); }
      return res.status(500).json(body);
    }
    const resp: any = { error: "Failed to delete product" };
    if (process.env.NODE_ENV !== "production") {
      resp.detail = { message: (error as any)?.message, code: (error as any)?.code, detail: (error as any)?.detail, stack: (error as any)?.stack };
    }
    return res.status(500).json(resp);
  }
});

export default router;