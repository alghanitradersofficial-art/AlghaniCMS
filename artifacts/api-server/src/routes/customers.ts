import { Router } from "express";
import { db } from "@workspace/db";
import { customersTable, salesTable } from "@workspace/db";
import { eq, ilike, sql } from "drizzle-orm";
import { CreateCustomerBody, UpdateCustomerBody } from "@workspace/api-zod";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const search = req.query.search as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
      .from(customersTable)
      .where(search ? ilike(customersTable.name, `%${search}%`) : undefined);
    const total = Number(count);

    const rows = await db.select({
      id: customersTable.id,
      name: customersTable.name,
      phone: customersTable.phone,
      email: customersTable.email,
      address: customersTable.address,
      city: customersTable.city,
      type: customersTable.type,
      createdAt: customersTable.createdAt,
      totalOrders: sql<number>`COALESCE((SELECT COUNT(*) FROM sales WHERE customer_id = ${customersTable.id} AND status != 'cancelled'), 0)`,
      totalSpent: sql<number>`COALESCE((SELECT SUM(total::numeric) FROM sales WHERE customer_id = ${customersTable.id} AND status != 'cancelled'), 0)`,
    })
      .from(customersTable)
      .where(search ? ilike(customersTable.name, `%${search}%`) : undefined)
      .limit(limit)
      .offset(offset);

    return res.json({
      data: rows.map(r => ({
        ...r,
        totalOrders: Number(r.totalOrders),
        totalSpent: parseFloat(String(r.totalSpent)),
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch customers" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = CreateCustomerBody.parse(req.body);
    const [customer] = await db.insert(customersTable).values(body).returning();
    return res.status(201).json({
      ...customer,
      totalOrders: 0,
      totalSpent: 0,
      createdAt: customer.createdAt.toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create customer" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, id));
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    return res.json({
      ...customer,
      totalOrders: 0,
      totalSpent: 0,
      createdAt: customer.createdAt.toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch customer" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = UpdateCustomerBody.parse(req.body);
    const [customer] = await db.update(customersTable).set(body).where(eq(customersTable.id, id)).returning();
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    return res.json({
      ...customer,
      totalOrders: 0,
      totalSpent: 0,
      createdAt: customer.createdAt.toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update customer" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(customersTable).where(eq(customersTable.id, id));
    res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete customer" });
  }
});

export default router;
