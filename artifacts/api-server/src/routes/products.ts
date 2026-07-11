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
    console.error(error);
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
    return res.status(500).json({ error: "Failed to delete product" });
  }
});

export default router;