import { Router } from "express";
import { pool } from "@workspace/db";
import { CreateProductBody, UpdateProductBody, GetProductsQueryParams } from "@workspace/api-zod";

const router = Router();

async function destroyCloudinaryAsset(publicId: string) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return;
  const timestamp = Math.floor(Date.now() / 1000);
  const crypto = require("crypto");
  const sha1 = crypto
    .createHash("sha1")
    .update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
    .digest("hex");
  const params = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: apiKey,
    signature: sha1,
  });
  await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: "POST",
    body: params,
  });
}

// GET /api/products
router.get("/", async (req, res): Promise<any> => { // Fixed return type
  try {
    const params = GetProductsQueryParams.parse(req.query);
    const { search, categoryId, brandId, lowStock, page = 1, limit = 20 } = params;

    const whereClauses: string[] = [];
    const queryParams: unknown[] = [];
    let idx = 1;

    if (search) { whereClauses.push(`p.name ILIKE $${idx++}`); queryParams.push(`%${search}%`); }
    if (categoryId) { whereClauses.push(`p.category_id = $${idx++}`); queryParams.push(Number(categoryId)); }
    if (brandId) { whereClauses.push(`p.brand_id = $${idx++}`); queryParams.push(Number(brandId)); }
    if (lowStock) { whereClauses.push(`p.current_stock <= p.min_stock`); }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const countResult = await pool.query(
      `SELECT COUNT(*) AS count FROM products p ${whereStr}`,
      queryParams,
    );
    const total = parseInt(countResult.rows[0].count, 10);
    const offset = (Number(page) - 1) * Number(limit);

    const rowsResult = await pool.query(
      `SELECT p.id, p.name, p.sku, p.description,
              p.category_id AS "categoryId", p.brand_id AS "brandId",
              c.name AS "categoryName", b.name AS "brandName",
              p.cost_price AS "costPrice", p.sale_price AS "salePrice",
              p.current_stock AS "currentStock", p.min_stock AS "minStock",
              p.unit, p.oem_number AS "oemNumber", p.barcode,
              p.image_url AS "imageUrl", p.image_public_id AS "imagePublicId",
              p.created_at AS "createdAt"
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN brands b ON p.brand_id = b.id
       ${whereStr}
       ORDER BY p.id DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...queryParams, Number(limit), offset],
    );

    return res.json({
      data: rowsResult.rows.map((r: Record<string, unknown>) => ({
        ...r,
        costPrice: parseFloat(r.costPrice as string),
        salePrice: parseFloat(r.salePrice as string),
        createdAt: r.createdAt instanceof Date ? (r.createdAt as Date).toISOString() : r.createdAt,
      })),
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch products" });
  }
});

// POST /api/products
router.post("/", async (req, res): Promise<any> => { // Fixed return type
  try {
    const body = CreateProductBody.parse(req.body) as any;
    const result = await pool.query(
      `INSERT INTO products (name, sku, description, category_id, brand_id,
                             cost_price, sale_price, current_stock, min_stock,
                             unit, oem_number, barcode, image_url, image_public_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id, name, sku, description,
                 category_id AS "categoryId", brand_id AS "brandId",
                 cost_price AS "costPrice", sale_price AS "salePrice",
                 current_stock AS "currentStock", min_stock AS "minStock",
                 unit, oem_number AS "oemNumber", barcode,
                 image_url AS "imageUrl", image_public_id AS "imagePublicId",
                 created_at AS "createdAt"`,
      [
        body.name,
        body.sku,
        body.description ?? null,
        body.categoryId ?? null,
        body.brandId ?? null,
        String(body.costPrice),
        String(body.salePrice),
        body.currentStock ?? 0,
        body.minStock ?? 5,
        body.unit ?? "pcs",
        body.oemNumber ?? null,
        body.barcode ?? null,
        body.imageUrl ?? null,
        body.imagePublicId ?? null,
      ],
    );
    const product = result.rows[0] as Record<string, unknown>;
    return res.status(201).json({
      ...product,
      costPrice: parseFloat(product.costPrice as string),
      salePrice: parseFloat(product.salePrice as string),
      createdAt: product.createdAt instanceof Date ? (product.createdAt as Date).toISOString() : product.createdAt,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create product" });
  }
});

// GET /api/products/:id
router.get("/:id", async (req, res): Promise<any> => { // Fixed return type
  try {
    const id = parseInt(req.params.id);
    const result = await pool.query(
      `SELECT p.id, p.name, p.sku, p.description,
              p.category_id AS "categoryId", p.brand_id AS "brandId",
              c.name AS "categoryName", b.name AS "brandName",
              p.cost_price AS "costPrice", p.sale_price AS "salePrice",
              p.current_stock AS "currentStock", p.min_stock AS "minStock",
              p.unit, p.oem_number AS "oemNumber", p.barcode,
              p.image_url AS "imageUrl", p.image_public_id AS "imagePublicId",
              p.created_at AS "createdAt"
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN brands b ON p.brand_id = b.id
       WHERE p.id = $1`,
      [id],
    );
    if (!result.rows.length) { return res.status(404).json({ error: "Product not found" }); }
    const row = result.rows[0] as Record<string, unknown>;
    return res.json({
      ...row,
      costPrice: parseFloat(row.costPrice as string),
      salePrice: parseFloat(row.salePrice as string),
      createdAt: row.createdAt instanceof Date ? (row.createdAt as Date).toISOString() : row.createdAt,
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch product" });
  }
});

// PATCH /api/products/:id
router.patch("/:id", async (req, res): Promise<any> => { // Fixed return type
  try {
    const id = parseInt(req.params.id);
    const body = UpdateProductBody.parse(req.body) as any;
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (body.name !== undefined) { updates.push(`name = $${idx++}`); values.push(body.name); }
    if (body.sku !== undefined) { updates.push(`sku = $${idx++}`); values.push(body.sku); }
    if (body.description !== undefined) { updates.push(`description = $${idx++}`); values.push(body.description); }
    if (body.categoryId !== undefined) { updates.push(`category_id = $${idx++}`); values.push(body.categoryId); }
    if (body.brandId !== undefined) { updates.push(`brand_id = $${idx++}`); values.push(body.brandId); }
    if (body.costPrice !== undefined) { updates.push(`cost_price = $${idx++}`); values.push(String(body.costPrice)); }
    if (body.salePrice !== undefined) { updates.push(`sale_price = $${idx++}`); values.push(String(body.salePrice)); }
    if (body.currentStock !== undefined) { updates.push(`current_stock = $${idx++}`); values.push(body.currentStock); }
    if (body.minStock !== undefined) { updates.push(`min_stock = $${idx++}`); values.push(body.minStock); }
    if (body.unit !== undefined) { updates.push(`unit = $${idx++}`); values.push(body.unit); }
    if (body.oemNumber !== undefined) { updates.push(`oem_number = $${idx++}`); values.push(body.oemNumber); }
    if (body.barcode !== undefined) { updates.push(`barcode = $${idx++}`); values.push(body.barcode); }
    if (body.imageUrl !== undefined) { updates.push(`image_url = $${idx++}`); values.push(body.imageUrl); }
    if (body.imagePublicId !== undefined) { updates.push(`image_public_id = $${idx++}`); values.push(body.imagePublicId); }

    if (updates.length === 0) { return res.status(400).json({ error: "Nothing to update" }); }
    values.push(id);

    const result = await pool.query(
      `UPDATE products SET ${updates.join(", ")} WHERE id = $${idx}
       RETURNING id, name, sku, description,
                 category_id AS "categoryId", brand_id AS "brandId",
                 cost_price AS "costPrice", sale_price AS "salePrice",
                 current_stock AS "currentStock", min_stock AS "minStock",
                 unit, oem_number AS "oemNumber", barcode,
                 image_url AS "imageUrl", image_public_id AS "imagePublicId",
                 created_at AS "createdAt"`,
      values,
    );
    if (!result.rows.length) { return res.status(404).json({ error: "Product not found" }); }
    const product = result.rows[0] as Record<string, unknown>;
    return res.json({
      ...product,
      costPrice: parseFloat(product.costPrice as string),
      salePrice: parseFloat(product.salePrice as string),
      createdAt: product.createdAt instanceof Date ? (product.createdAt as Date).toISOString() : product.createdAt,
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update product" });
  }
});

// DELETE /api/products/:id
router.delete("/:id", async (req, res): Promise<any> => { // Fixed return type
  try {
    const id = parseInt(req.params.id);
    const existing = await pool.query(`SELECT image_public_id FROM products WHERE id = $1`, [id]);
    const publicId = existing.rows[0]?.image_public_id;
    if (publicId) {
      await destroyCloudinaryAsset(publicId as string);
    }
    await pool.query(`DELETE FROM products WHERE id = $1`, [id]);
    return res.status(204).send(); // Added return block to ensure consistency
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to delete product" });
  }
});

export default router;