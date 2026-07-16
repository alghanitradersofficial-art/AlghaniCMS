import { Router } from "express";
import { db } from "@workspace/db";
import { categoriesTable, productsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateCategoryBody, UpdateCategoryBody } from "@workspace/api-zod";
import { logger } from "../lib/logger.js";

const router = Router();

async function getProductCount(categoryId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(productsTable)
    .where(eq(productsTable.categoryId, categoryId));
  return Number(row?.count ?? 0);
}

router.get("/", async (req, res): Promise<any> => {
  try {
    const rows = await db.select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      description: categoriesTable.description,
      productCount: sql<number>`COUNT(${productsTable.id})`,
    })
      .from(categoriesTable)
      .leftJoin(productsTable, eq(productsTable.categoryId, categoriesTable.id))
      .groupBy(categoriesTable.id);

    return res.json(rows.map(r => ({ ...r, productCount: Number(r.productCount) })));
  } catch (error) {
    logger.error({ err: error }, "Failed to fetch categories");
    return res.status(500).json({ error: "Failed to fetch categories" });
  }
});

router.post("/", async (req, res): Promise<any> => {
  try {
    const body = CreateCategoryBody.parse(req.body);
    // Cast to any to align loose validation inferences with strict database insert constraints
    const [category] = await db.insert(categoriesTable).values(body as any).returning();
    // A brand-new category can't have products yet, so 0 is genuinely correct here.
    return res.status(201).json({ ...category, productCount: 0 });
  } catch (error) {
    logger.error({ err: error }, "Failed to create category");
    return res.status(500).json({ error: "Failed to create category" });
  }
});

router.patch("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    const body = UpdateCategoryBody.parse(req.body);
    const [category] = await db.update(categoriesTable).set(body).where(eq(categoriesTable.id, id)).returning();
    if (!category) return res.status(404).json({ error: "Category not found" });
    // Recalculate the real count instead of hardcoding 0 — an edited
    // category can already have products assigned to it.
    const productCount = await getProductCount(id);
    return res.json({ ...category, productCount });
  } catch (error) {
    logger.error({ err: error }, "Failed to update category");
    return res.status(500).json({ error: "Failed to update category" });
  }
});

router.delete("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    const productCount = await getProductCount(id);
    if (productCount > 0) {
      return res.status(409).json({ error: `Cannot delete category with ${productCount} product(s) still assigned to it` });
    }
    await db.delete(categoriesTable).where(eq(categoriesTable.id, id));
    return res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, "Failed to delete category");
    return res.status(500).json({ error: "Failed to delete category" });
  }
});

export default router;