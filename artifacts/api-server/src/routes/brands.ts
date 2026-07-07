import { Router } from "express";
import { db } from "@workspace/db";
import { brandsTable, productsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateBrandBody, UpdateBrandBody } from "@workspace/api-zod";

const router = Router();

router.get("/", async (req, res) => {
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
    return res.status(500).json({ error: "Failed to fetch brands" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = CreateBrandBody.parse(req.body);
    const [brand] = await db.insert(brandsTable).values(body).returning();
    return res.status(201).json({ ...brand, productCount: 0 });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create brand" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = UpdateBrandBody.parse(req.body);
    const [brand] = await db.update(brandsTable).set(body).where(eq(brandsTable.id, id)).returning();
    if (!brand) return res.status(404).json({ error: "Brand not found" });
    return res.json({ ...brand, productCount: 0 });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update brand" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(brandsTable).where(eq(brandsTable.id, id));
    res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete brand" });
  }
});

export default router;
