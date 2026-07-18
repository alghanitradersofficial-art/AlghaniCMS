import { pool } from "@workspace/db";
import crypto from "crypto";

async function destroyCloudinaryAsset(publicId: string) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return;
  const timestamp = Math.floor(Date.now() / 1000);
  const sha1 = crypto.createHash("sha1").update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`).digest("hex");
  const params = new URLSearchParams({ public_id: publicId, timestamp: String(timestamp), api_key: apiKey, signature: sha1 });
  await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, { method: "POST", body: params });
}

// Auto-generates a SKU from the product's own ID once it's known (e.g.
// product #16 -> "SKU-000016"). This only runs when the user leaves SKU
// blank; a manually typed SKU is always respected as-is.
function generateSkuFromId(id: number): string {
  return `SKU-${String(id).padStart(6, "0")}`;
}

async function isSkuTaken(sku: string, excludeId?: number): Promise<boolean> {
  const result = excludeId
    ? await pool.query(`SELECT 1 FROM products WHERE sku = $1 AND id != $2 LIMIT 1`, [sku, excludeId])
    : await pool.query(`SELECT 1 FROM products WHERE sku = $1 LIMIT 1`, [sku]);
  return (result.rowCount ?? 0) > 0;
}

export async function listProducts(params: Record<string, any>) {
  const { search, categoryId, brandId, lowStock, page = 1, limit = 20 } = params;
  const whereClauses: string[] = [];
  const queryParams: unknown[] = [];
  let idx = 1;
  if (search) { whereClauses.push(`p.name ILIKE $${idx++}`); queryParams.push(`%${search}%`); }
  if (categoryId) { whereClauses.push(`p.category_id = $${idx++}`); queryParams.push(Number(categoryId)); }
  if (brandId) { whereClauses.push(`p.brand_id = $${idx++}`); queryParams.push(Number(brandId)); }
  if (lowStock) { whereClauses.push(`p.current_stock <= p.min_stock`); }

  const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const countResult = await pool.query(`SELECT COUNT(*) AS count FROM products p ${whereStr}`, queryParams);
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

  return {
    data: rowsResult.rows.map((r: Record<string, unknown>) => ({
      ...r,
      costPrice: parseFloat(r.costPrice as string),
      salePrice: r.salePrice != null ? parseFloat(r.salePrice as string) : null,
      createdAt: r.createdAt instanceof Date ? (r.createdAt as Date).toISOString() : r.createdAt,
    })),
    total,
    page: Number(page),
    limit: Number(limit),
  };
}

export async function createProduct(body: any, actorUserId: number | null) {
  const providedSku = typeof body.sku === "string" ? body.sku.trim() : "";
  // Placeholder is only ever stored for the instant between insert and the
  // follow-up update below — it's never shown to the user.
  const placeholderSku = providedSku || `TMP-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

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
      placeholderSku,
      body.description ?? null,
      body.categoryId ?? null,
      body.brandId ?? null,
      String(body.costPrice),
      body.salePrice != null ? String(body.salePrice) : null,
      body.currentStock ?? 0,
      body.minStock ?? 5,
      body.unit ?? "pcs",
      body.oemNumber ?? null,
      body.barcode ?? null,
      body.imageUrl ?? null,
      body.imagePublicId ?? null,
    ],
  );
  let product = result.rows[0];

  // Only auto-generate a SKU when the user left it blank. The real product
  // ID is now known, so the SKU can be derived from it (e.g. "SKU-000016")
  // instead of a random placeholder.
  if (!providedSku) {
    const generated = generateSkuFromId(product.id);
    if (!(await isSkuTaken(generated, product.id))) {
      const updateResult = await pool.query(
        `UPDATE products SET sku = $1 WHERE id = $2
         RETURNING id, name, sku, description,
                   category_id AS "categoryId", brand_id AS "brandId",
                   cost_price AS "costPrice", sale_price AS "salePrice",
                   current_stock AS "currentStock", min_stock AS "minStock",
                   unit, oem_number AS "oemNumber", barcode,
                   image_url AS "imageUrl", image_public_id AS "imagePublicId",
                   created_at AS "createdAt"`,
        [generated, product.id],
      );
      product = updateResult.rows[0];
    }
  }

  try {
    await pool.query(`INSERT INTO audit_log (entity_type, entity_id, action, new_value, performed_by_user_id) VALUES ($1,$2,$3,$4,$5)`, ["product", product.id, "create", JSON.stringify(product), actorUserId]);
  } catch (err) {
    console.warn("Failed to write audit log for product create", err);
  }
  return {
    ...product,
    costPrice: parseFloat(product.costPrice as string),
    salePrice: product.salePrice != null ? parseFloat(product.salePrice as string) : null,
    createdAt: product.createdAt instanceof Date ? (product.createdAt as Date).toISOString() : product.createdAt,
  };
}

export async function getProduct(id: number) {
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
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return {
    ...row,
    costPrice: parseFloat(row.costPrice as string),
    salePrice: row.salePrice != null ? parseFloat(row.salePrice as string) : null,
    createdAt: row.createdAt instanceof Date ? (row.createdAt as Date).toISOString() : row.createdAt,
  };
}

export async function updateProduct(id: number, body: any, actorUserId: number | null) {
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (body.name !== undefined) { updates.push(`name = $${idx++}`); values.push(body.name); }
  if (body.sku !== undefined) { updates.push(`sku = $${idx++}`); values.push(body.sku); }
  if (body.description !== undefined) { updates.push(`description = $${idx++}`); values.push(body.description); }
  if (body.categoryId !== undefined) { updates.push(`category_id = $${idx++}`); values.push(body.categoryId); }
  if (body.brandId !== undefined) { updates.push(`brand_id = $${idx++}`); values.push(body.brandId); }
  if (body.costPrice !== undefined) { updates.push(`cost_price = $${idx++}`); values.push(String(body.costPrice)); }
  if (body.salePrice !== undefined) { updates.push(`sale_price = $${idx++}`); values.push(body.salePrice != null ? String(body.salePrice) : null); }
  if (body.currentStock !== undefined) { updates.push(`current_stock = $${idx++}`); values.push(body.currentStock); }
  if (body.minStock !== undefined) { updates.push(`min_stock = $${idx++}`); values.push(body.minStock); }
  if (body.unit !== undefined) { updates.push(`unit = $${idx++}`); values.push(body.unit); }
  if (body.oemNumber !== undefined) { updates.push(`oem_number = $${idx++}`); values.push(body.oemNumber); }
  if (body.barcode !== undefined) { updates.push(`barcode = $${idx++}`); values.push(body.barcode); }
  if (body.imageUrl !== undefined) { updates.push(`image_url = $${idx++}`); values.push(body.imageUrl); }
  if (body.imagePublicId !== undefined) { updates.push(`image_public_id = $${idx++}`); values.push(body.imagePublicId); }

  if (updates.length === 0) throw new Error("Nothing to update");
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
  if (!result.rows.length) return null;
  const product = result.rows[0];
  try {
    await pool.query(`INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, performed_by_user_id) VALUES ($1,$2,$3,$4,$5,$6)`, ["product", id, "update", null, JSON.stringify(product), actorUserId]);
  } catch (err) {
    console.warn("Failed to write audit log for product update", err);
  }
  return {
    ...product,
    costPrice: parseFloat(product.costPrice as string),
    salePrice: product.salePrice != null ? parseFloat(product.salePrice as string) : null,
    createdAt: product.createdAt instanceof Date ? (product.createdAt as Date).toISOString() : product.createdAt,
  };
}

export async function deleteProduct(id: number, actorUserId: number | null) {
  console.log("deleteProduct: start", { id });
  const existing = await pool.query(`SELECT image_public_id FROM products WHERE id = $1`, [id]);
  const publicId = existing.rows[0]?.image_public_id;
  console.log("deleteProduct: fetched existing", { id, publicId });
  // Pre-check for referencing rows in FK tables to provide a clearer error
  try {
    const refs = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM customer_price_history WHERE product_id = $1) AS customer_price_history_count,
         (SELECT COUNT(*) FROM supplier_products WHERE product_id = $1) AS supplier_products_count,
         (SELECT COUNT(*) FROM stock_adjustments WHERE product_id = $1) AS stock_adjustments_count
       `,
      [id],
    );
    const r = refs.rows[0];
    if (Number(r.customer_price_history_count) > 0 || Number(r.supplier_products_count) > 0 || Number(r.stock_adjustments_count) > 0) {
      const detail = {
        customer_price_history: Number(r.customer_price_history_count),
        supplier_products: Number(r.supplier_products_count),
        stock_adjustments: Number(r.stock_adjustments_count),
      };
      const e: any = new Error("Product is referenced by other records");
      e.code = "REFERENCED";
      e.detail = detail;
      console.warn("deleteProduct: aborting delete due to references", { id, detail });
      throw e;
    }
  } catch (err) {
    // If the check query fails for unexpected reasons, log and continue to attempt delete
    console.warn("deleteProduct: reference check failed", { id, err });
  }
  if (publicId) {
    try {
      console.log("deleteProduct: destroying cloudinary asset", { id, publicId });
      await destroyCloudinaryAsset(publicId as string);
      console.log("deleteProduct: cloudinary asset destroyed", { id, publicId });
    } catch (err) {
      console.warn("Failed to delete Cloudinary asset for product", { id, publicId, err });
      console.warn("deleteProduct: aborting delete due to cloudinary failure", { id });
      throw new Error("Failed to delete product image before product removal");
    }
  }

  try {
    console.log("deleteProduct: deleting DB row", { id });
    await pool.query(`DELETE FROM products WHERE id = $1`, [id]);
    console.log("deleteProduct: DB row deleted", { id });
  } catch (err) {
    console.error("Product delete failed", { id, error: err, stack: (err as any)?.stack });
    throw err;
  }

  try {
    await pool.query(`INSERT INTO audit_log (entity_type, entity_id, action, performed_by_user_id) VALUES ($1,$2,$3,$4)`, ["product", id, "delete", actorUserId]);
  } catch (err) {
    console.warn("Failed to write audit log for product delete", err);
  }
}

export default { listProducts, createProduct, getProduct, updateProduct, deleteProduct };
