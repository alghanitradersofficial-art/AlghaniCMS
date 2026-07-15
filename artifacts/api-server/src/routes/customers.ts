import { Router } from "express";
import { db, salesTable } from "@workspace/db";
import { customersTable } from "@workspace/db";
import { eq, ilike, sql } from "drizzle-orm";
import { CreateCustomerBody, UpdateCustomerBody } from "@workspace/api-zod";
import { buildCustomerMetricsMap } from "../lib/customer-summary.js";

const router = Router();

// Debug: log hits and auth for diagnosing unexpected 403 responses
router.use((req, res, next) => {
  // eslint-disable-next-line no-console
  console.log("[debug] customers router hit", { path: req.path, method: req.method, auth: (req as any).auth || null });
  next();
});

router.get("/", async (req, res): Promise<any> => {
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
      creditLimit: customersTable.creditLimit,
    })
      .from(customersTable)
      .where(search ? ilike(customersTable.name, `%${search}%`) : undefined)
      .limit(limit)
      .offset(offset);

    const customerIds = rows.map((row) => row.id);
    const customerSales = customerIds.length
      ? await db.select({
          customerId: salesTable.customerId,
          customerName: salesTable.customerName,
          status: salesTable.status,
          total: salesTable.total,
        })
          .from(salesTable)
          .where(sql`${salesTable.customerId} IS NOT NULL AND ${salesTable.customerId} = ANY(${customerIds})`)
      : [];
    const metricsByCustomerId = buildCustomerMetricsMap(customerSales, rows);

    return res.json({
      data: rows.map((r) => {
        const metrics = metricsByCustomerId.get(r.id) ?? { totalOrders: 0, totalSpent: 0 };
        return {
          ...r,
          totalOrders: metrics.totalOrders,
          totalSpent: metrics.totalSpent,
          creditLimit: parseFloat(String(r.creditLimit)),
          createdAt: r.createdAt.toISOString(),
        };
      }),
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch customers" });
  }
});

router.post("/", async (req, res): Promise<any> => {
  try {
    const body = CreateCustomerBody.parse(req.body);
    // loose validation structure ko strict drizzle structure k sath align krne k liye 'as any' cast kia
    const insertValues: any = { ...body };
    if (insertValues.creditLimit !== undefined) {
      insertValues.creditLimit = String(insertValues.creditLimit);
    }
    const [customer] = await db.insert(customersTable).values(insertValues).returning();
    return res.status(201).json({
      ...customer,
      totalOrders: 0,
      totalSpent: 0,
      creditLimit: parseFloat(customer.creditLimit as string),
      createdAt: customer.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("customer create failed", error);
    return res.status(500).json({ error: "Failed to create customer" });
  }
});

router.get("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, id));
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    const [salesSummary] = await db.select({
      totalOrders: sql<number>`COALESCE(count(*), 0)`,
      totalSpent: sql<number>`COALESCE(sum(${salesTable.total}::numeric), 0)`,
    }).from(salesTable).where(sql`${salesTable.customerId} = ${id} AND ${salesTable.status} != 'cancelled' AND ${salesTable.status} != 'void'`);
    return res.json({
      ...customer,
      totalOrders: Number(salesSummary?.totalOrders ?? 0),
      totalSpent: Number(salesSummary?.totalSpent ?? 0),
      creditLimit: parseFloat(customer.creditLimit as string),
      createdAt: customer.createdAt.toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch customer" });
  }
});

router.patch("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    const body = UpdateCustomerBody.parse(req.body);
    const updateValues: any = { ...body };
    if (updateValues.creditLimit !== undefined) {
      updateValues.creditLimit = String(updateValues.creditLimit);
    }
    const [customer] = await db.update(customersTable).set(updateValues).where(eq(customersTable.id, id)).returning();
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    const [salesSummary] = await db.select({
      totalOrders: sql<number>`COALESCE(count(*), 0)`,
      totalSpent: sql<number>`COALESCE(sum(${salesTable.total}::numeric), 0)`,
    }).from(salesTable).where(sql`${salesTable.customerId} = ${id} AND ${salesTable.status} != 'cancelled' AND ${salesTable.status} != 'void'`);
    return res.json({
      ...customer,
      totalOrders: Number(salesSummary?.totalOrders ?? 0),
      totalSpent: Number(salesSummary?.totalSpent ?? 0),
      creditLimit: parseFloat(customer.creditLimit as string),
      createdAt: customer.createdAt.toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update customer" });
  }
});

router.delete("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(customersTable).where(eq(customersTable.id, id));
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete customer" });
  }
});

export default router;