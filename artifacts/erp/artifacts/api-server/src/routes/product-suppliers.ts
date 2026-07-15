import { Router } from "express";
import { db, supplierProductsTable, suppliersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// GET /api/products/:id/suppliers — reverse lookup: which suppliers provide this product,
// with each supplier's custom SKU/name and cost price for it.
router.get("/:id/suppliers", async (req, res): Promise<any> => {
  try {
    const productId = parseInt(req.params.id);
    const rows = await db
      .select({ sp: supplierProductsTable, supplier: suppliersTable })
      .from(supplierProductsTable)
      .leftJoin(suppliersTable, eq(supplierProductsTable.supplierId, suppliersTable.id))
      .where(eq(supplierProductsTable.productId, productId));

    return res.json(rows.map((r) => ({
      id: r.sp.id,
      supplierId: r.sp.supplierId,
      supplierName: r.supplier?.name ?? null,
      supplierPhone: r.supplier?.phone ?? null,
      supplierSku: r.sp.supplierSku,
      supplierProductName: r.sp.supplierProductName,
      costPrice: r.sp.costPrice ? parseFloat(r.sp.costPrice as string) : null,
      isPreferred: r.sp.isPreferred,
      notes: r.sp.notes,
    })));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch product suppliers" });
  }
});

export default router;
