import { Router } from "express";
import { CreateProductBody, UpdateProductBody, GetProductsQueryParams } from "@workspace/api-zod";
import productsService from "../services/products.service.js";
import { getUserIdFromRequest } from "../lib/auth-context.js";

const router = Router();

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