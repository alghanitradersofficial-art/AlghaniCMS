import { Router } from "express";
import { z } from "zod";
import { db, supplierProductsTable, productsTable, suppliersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

const AddSupplierProductBody = z.object({
  productId: z.number().int().positive(),
  supplierSku: z.string().optional(),
  supplierProductName: z.string().optional(),
  costPrice: z.number().nonnegative().optional(),
  isPreferred: z.boolean().default(false),
  notes: z.string().optional(),
});

const UpdateSupplierProductBody = AddSupplierProductBody.partial().omit({ productId: true });

function fmt(row: typeof supplierProductsTable.$inferSelect, product?: { name: string; sku: string; imageUrl: string | null } | null) {
  return {
    id: row.id,
    supplierId: row.supplierId,
    productId: row.productId,
    productName: product?.name ?? null,
    productSku: product?.sku ?? null,
    productImageUrl: product?.imageUrl ?? null,
    supplierSku: row.supplierSku,
    supplierProductName: row.supplierProductName,
    costPrice: row.costPrice ? parseFloat(row.costPrice as string) : null,
    isPreferred: row.isPreferred,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

// GET /api/suppliers/:id/products — this supplier's product catalog + custom names
router.get("/:id/products", async (req, res): Promise<any> => {
  try {
    const supplierId = parseInt(req.params.id);
    const rows = await db
      .select({ sp: supplierProductsTable, product: productsTable })
      .from(supplierProductsTable)
      .leftJoin(productsTable, eq(supplierProductsTable.productId, productsTable.id))
      .where(eq(supplierProductsTable.supplierId, supplierId));

    return res.json(rows.map((r) => fmt(r.sp, r.product)));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch supplier products" });
  }
});

// POST /api/suppliers/:id/products — link a product to this supplier (with optional custom name/SKU)
router.post("/:id/products", async (req, res): Promise<any> => {
  try {
    const supplierId = parseInt(req.params.id);
    const body = AddSupplierProductBody.parse(req.body);

    const [existing] = await db
      .select()
      .from(supplierProductsTable)
      .where(and(eq(supplierProductsTable.supplierId, supplierId), eq(supplierProductsTable.productId, body.productId)));
    if (existing) return res.status(400).json({ error: "This product is already linked to this supplier" });

    const [row] = await db.insert(supplierProductsTable).values({
      supplierId,
      productId: body.productId,
      supplierSku: body.supplierSku ?? null,
      supplierProductName: body.supplierProductName ?? null,
      costPrice: body.costPrice !== undefined ? String(body.costPrice) : null,
      isPreferred: body.isPreferred,
      notes: body.notes ?? null,
    }).returning();

    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, body.productId));
    return res.status(201).json(fmt(row, product));
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues });
    return res.status(500).json({ error: "Failed to link product to supplier" });
  }
});

// PATCH /api/suppliers/:id/products/:linkId
router.patch("/:id/products/:linkId", async (req, res): Promise<any> => {
  try {
    const linkId = parseInt(req.params.linkId);
    const body = UpdateSupplierProductBody.parse(req.body);
    const updateData: Record<string, unknown> = { ...body };
    if (body.costPrice !== undefined) updateData.costPrice = String(body.costPrice);

    const [row] = await db.update(supplierProductsTable).set(updateData).where(eq(supplierProductsTable.id, linkId)).returning();
    if (!row) return res.status(404).json({ error: "Link not found" });

    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, row.productId));
    return res.json(fmt(row, product));
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues });
    return res.status(500).json({ error: "Failed to update link" });
  }
});

// DELETE /api/suppliers/:id/products/:linkId
router.delete("/:id/products/:linkId", async (req, res): Promise<any> => {
  try {
    const linkId = parseInt(req.params.linkId);
    await db.delete(supplierProductsTable).where(eq(supplierProductsTable.id, linkId));
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Failed to remove link" });
  }
});

export default router;
