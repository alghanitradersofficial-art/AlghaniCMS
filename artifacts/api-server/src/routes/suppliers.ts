import { Router } from "express";
import { db } from "@workspace/db";
import { suppliersTable } from "@workspace/db";
import { eq, ilike } from "drizzle-orm";
import { CreateSupplierBody, UpdateSupplierBody } from "@workspace/api-zod";

const router = Router();

router.get("/", async (req, res): Promise<any> => {
  try {
    const search = req.query.search as string;
    const rows = await db.select().from(suppliersTable)
      .where(search ? ilike(suppliersTable.name, `%${search}%`) : undefined);
    return res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch suppliers" });
  }
});

router.post("/", async (req, res): Promise<any> => {
  try {
    const body = CreateSupplierBody.parse(req.body);
    // Cast to any to align loose validation inferences with strict database insert constraints
    const [supplier] = await db.insert(suppliersTable).values(body as any).returning();
    return res.status(201).json({ ...supplier, createdAt: supplier.createdAt.toISOString() });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create supplier" });
  }
});

router.patch("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    const body = UpdateSupplierBody.parse(req.body);
    const [supplier] = await db.update(suppliersTable).set(body).where(eq(suppliersTable.id, id)).returning();
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });
    return res.json({ ...supplier, createdAt: supplier.createdAt.toISOString() });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update supplier" });
  }
});

router.delete("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(suppliersTable).where(eq(suppliersTable.id, id));
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete supplier" });
  }
});

export default router;