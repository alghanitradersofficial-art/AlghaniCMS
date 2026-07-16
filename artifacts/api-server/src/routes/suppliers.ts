import { Router } from "express";
import { db } from "@workspace/db";
import { suppliersTable } from "@workspace/db";
import { eq, ilike } from "drizzle-orm";
import { CreateSupplierBody, UpdateSupplierBody } from "@workspace/api-zod";
import { logger } from "../lib/logger.js";

const router = Router();

// NOTE: this intentionally still returns a bare array (not the
// {data,total,page,limit} shape used by customers/sales/purchases) because
// the generated frontend client (useGetSuppliers) and pages/suppliers.tsx
// are typed against an array today. Changing the shape here requires
// regenerating lib/api-spec + lib/api-client-react and updating
// pages/suppliers.tsx / pages/supplier-detail.tsx together in the same
// change — flagged in the report as a follow-up, not fixed blindly here to
// avoid silently breaking the supplier list page.
router.get("/", async (req, res): Promise<any> => {
  try {
    const search = req.query.search as string;
    const rows = await db.select().from(suppliersTable)
      .where(search ? ilike(suppliersTable.name, `%${search}%`) : undefined);
    return res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
  } catch (error) {
    logger.error({ err: error }, "Failed to fetch suppliers");
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
    logger.error({ err: error }, "Failed to create supplier");
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
    logger.error({ err: error }, "Failed to update supplier");
    return res.status(500).json({ error: "Failed to update supplier" });
  }
});

router.delete("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(suppliersTable).where(eq(suppliersTable.id, id));
    return res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, "Failed to delete supplier");
    return res.status(500).json({ error: "Failed to delete supplier" });
  }
});

export default router;
