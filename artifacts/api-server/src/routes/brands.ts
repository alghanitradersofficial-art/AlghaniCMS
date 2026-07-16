import { Router } from "express";
import { db } from "@workspace/db";
import { brandsTable, productsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateBrandBody, UpdateBrandBody } from "@workspace/api-zod";
import { logger } from "../lib/logger.js";

const router = Router();

async function getProductCount(brandId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(productsTable)
    .where(eq(productsTable.brandId, brandId));
  return Number(row?.count ?? 0);
}

router.get("/", async (req, res): Promise<any> => {
  try {
    const rows = await db.select({
      id: brandsTable.id,
      name: brandsTable.name,
      description: brandsTable.description,
      productCount: sql<number>`COUNT(${productsTable.id})`,
    })
      .from(brandsTable)
      .leftJoin(productsTable, eq(productsTable.brandId, brandsTable.id))
      .groupBy(brandsTable.id);

    return res.json(rows.map(r => ({ ...r, productCount: Number(r.productCount) })));
  } catch (error) {
    logger.error({ err: error }, "Failed to fetch brands");
    return res.status(500).json({ error: "Failed to fetch brands" });
  }
});

router.post("/", async (req, res): Promise<any> => {
  try {
    const body = CreateBrandBody.parse(req.body);
    // Cast to any to reconcile inferred validation types with strict Drizzle schemas
    const [brand] = await db.insert(brandsTable).values(body as any).returning();
    // A brand-new brand can't have products yet, so 0 is genuinely correct here.
    return res.status(201).json({ ...brand, productCount: 0 });
  } catch (error) {
    logger.error({ err: error }, "Failed to create brand");
    return res.status(500).json({ error: "Failed to create brand" });
  }
});

router.patch("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    const body = UpdateBrandBody.parse(req.body);
    const [brand] = await db.update(brandsTable).set(body).where(eq(brandsTable.id, id)).returning();
    if (!brand) return res.status(404).json({ error: "Brand not found" });
    // Recalculate the real count instead of hardcoding 0.
    const productCount = await getProductCount(id);
    return res.json({ ...brand, productCount });
  } catch (error) {
    logger.error({ err: error }, "Failed to update brand");
    return res.status(500).json({ error: "Failed to update brand" });
  }
});

router.delete("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    const productCount = await getProductCount(id);
    if (productCount > 0) {
      return res.status(409).json({ error: `Cannot delete brand with ${productCount} product(s) still assigned to it` });
    }
    await db.delete(brandsTable).where(eq(brandsTable.id, id));
    return res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, "Failed to delete brand");
    return res.status(500).json({ error: "Failed to delete brand" });
  }
});

export default router;
