import { Router } from "express";
import { db } from "@workspace/db";
import { salesTable, productsTable } from "@workspace/db";
import { eq, ilike, and, sql } from "drizzle-orm";
import { CreateSaleBody, UpdateSaleBody } from "@workspace/api-zod";

const router = Router();

function formatSale(sale: typeof salesTable.$inferSelect) {
  return {
    ...sale,
    subtotal: parseFloat(sale.subtotal as string),
    discount: parseFloat(sale.discount as string),
    total: parseFloat(sale.total as string),
    items: (sale.items as unknown[]) || [],
    createdAt: sale.createdAt.toISOString(),
  };
}

async function adjustSaleStock(sale: typeof salesTable.$inferSelect, delta: 1 | -1) {
  const items = (sale.items as unknown[]) || [];
  for (const item of items as Array<{ productId: number; quantity: number }>) {
    await db.update(productsTable).set({
      currentStock: sql`${productsTable.currentStock} + ${item.quantity * delta}`,
    }).where(eq(productsTable.id, item.productId));
  }
}

router.get("/", async (req, res) => {
  try {
    const search = req.query.search as string;
    const status = req.query.status as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (search) conditions.push(ilike(salesTable.customerName, `%${search}%`));
    if (status) conditions.push(eq(salesTable.status, status));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(salesTable).where(whereClause);
    const total = Number(count);

    const rows = await db.select().from(salesTable).where(whereClause)
      .orderBy(sql`${salesTable.createdAt} DESC`).limit(limit).offset(offset);

    return res.json({ data: rows.map(formatSale), total, page, limit });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch sales" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = CreateSaleBody.parse(req.body);
    const items = body.items.map((item: { productId: number; quantity: number; unitPrice: number }) => ({
      productId: item.productId,
      productName: "",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.quantity * item.unitPrice,
    }));

    // Fetch product names
    for (const item of items) {
      const [product] = await db.select({ name: productsTable.name }).from(productsTable).where(eq(productsTable.id, item.productId));
      if (product) item.productName = product.name;
    }

    // Deduct stock for completed sales
    if (!body.status || body.status === "completed") {
      for (const item of items) {
        await db.update(productsTable).set({
          currentStock: sql`${productsTable.currentStock} - ${item.quantity}`,
        }).where(eq(productsTable.id, item.productId));
      }
    }

    const subtotal = items.reduce((sum, i) => sum + i.total, 0);
    const discount = body.discount || 0;
    const total = subtotal - discount;

    const invoiceNumber = `INV-${Date.now()}`;

    const [sale] = await db.insert(salesTable).values({
      invoiceNumber,
      customerId: body.customerId ?? null,
      customerName: body.customerName,
      status: body.status || "completed",
      subtotal: String(subtotal),
      discount: String(discount),
      total: String(total),
      notes: body.notes ?? null,
      items: items,
    }).returning();

    return res.status(201).json(formatSale(sale));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create sale" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [sale] = await db.select().from(salesTable).where(eq(salesTable.id, id));
    if (!sale) return res.status(404).json({ error: "Sale not found" });
    return res.json(formatSale(sale));
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch sale" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = UpdateSaleBody.parse(req.body);
    const [existingSale] = await db.select().from(salesTable).where(eq(salesTable.id, id));
    if (!existingSale) return res.status(404).json({ error: "Sale not found" });

    const updateData: Record<string, unknown> = {};
    if (body.status !== undefined) updateData.status = body.status;
    if (body.discount !== undefined) updateData.discount = String(body.discount);
    if (body.notes !== undefined) updateData.notes = body.notes;

    if (body.status !== undefined && body.status !== existingSale.status) {
      if (existingSale.status === "completed" && body.status !== "completed") {
        await adjustSaleStock(existingSale, 1);
      } else if (existingSale.status !== "completed" && body.status === "completed") {
        await adjustSaleStock(existingSale, -1);
      }
    }

    const [sale] = await db.update(salesTable).set(updateData).where(eq(salesTable.id, id)).returning();
    return res.json(formatSale(sale));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to update sale" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(salesTable).where(eq(salesTable.id, id));
    res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete sale" });
  }
});

export default router;
