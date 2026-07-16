import { Router } from "express";
import { db } from "@workspace/db";
import { categoriesTable, productsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateCategoryBody, UpdateCategoryBody } from "@workspace/api-zod";

const router = Router();

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
    return res.status(500).json({ error: "Failed to fetch categories" });
  }
});

router.post("/", async (req, res): Promise<any> => {
  try {
    const body = CreateCategoryBody.parse(req.body);
    // Cast to any to align loose validation inferences with strict database insert constraints
    const [category] = await db.insert(categoriesTable).values(body as any).returning();
    return res.status(201).json({ ...category, productCount: 0 });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create category" });
  }
});

router.patch("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    const body = UpdateCategoryBody.parse(req.body);
    const [category] = await db.update(categoriesTable).set(body).where(eq(categoriesTable.id, id)).returning();
    if (!category) return res.status(404).json({ error: "Category not found" });
    return res.json({ ...category, productCount: 0 });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update category" });
  }
});

router.delete("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(categoriesTable).where(eq(categoriesTable.id, id));
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete category" });
  }
});

export default router;