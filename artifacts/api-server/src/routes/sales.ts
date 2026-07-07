import { Router } from "express";
import { db } from "@workspace/db";
import { salesTable, productsTable, priceHistoryTable } from "@workspace/db";
import { eq, ilike, and, sql, inArray } from "drizzle-orm";
import { CreateSaleBody, UpdateSaleBody } from "@workspace/api-zod";
import { appendLedgerEntry, round2 } from "../lib/ledger.js";
import { getUserIdFromRequest } from "../lib/auth-context.js";

const router = Router();

function formatSale(sale: typeof salesTable.$inferSelect) {
  return {
    ...sale,
    subtotal: parseFloat(sale.subtotal as string),
    discount: parseFloat(sale.discount as string),
    total: parseFloat(sale.total as string),
    amountPaid: parseFloat((sale.amountPaid as string) ?? "0"),
    items: (sale.items as unknown[]) || [],
    createdAt: sale.createdAt.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function adjustSaleStock(sale: typeof salesTable.$inferSelect, delta: 1 | -1, client: any = db) {
  const items = (sale.items as unknown[]) || [];
  for (const item of items as Array<{ productId: number; quantity: number }>) {
    await client.update(productsTable).set({
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
    const createdByUserId = getUserIdFromRequest(req);

    // Fetch product name + cost price for every line (needed for both the
    // invoice line display and the price-history/profit snapshot below).
    const productIds = [...new Set(body.items.map((i) => i.productId))];
    const products = productIds.length
      ? await db.select({ id: productsTable.id, name: productsTable.name, sku: productsTable.sku, costPrice: productsTable.costPrice })
          .from(productsTable)
          .where(inArray(productsTable.id, productIds))
      : [];
    const productById = new Map(products.map((p) => [p.id, p]));

    const subtotalRaw = body.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    const discount = body.discount || 0;
    // Line-level discount is apportioned pro-rata from the overall invoice
    // discount, so per-item "final price" and profit in the price history
    // are accurate even though this API only accepts a single invoice-level
    // discount today.
    const items = body.items.map((item) => {
      const product = productById.get(item.productId);
      const lineSubtotal = item.quantity * item.unitPrice;
      const lineDiscount = subtotalRaw > 0 ? round2(discount * (lineSubtotal / subtotalRaw)) : 0;
      const lineFinal = round2(lineSubtotal - lineDiscount);
      return {
        productId: item.productId,
        productName: product?.name ?? "",
        sku: product?.sku ?? "",
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        // `total` keeps its original meaning (pre-discount line subtotal) so
        // existing invoice PDF/export/report code that sums items[].total
        // and separately displays sale.discount is unaffected.
        total: round2(lineSubtotal),
        lineDiscount,
        finalPrice: lineFinal,
        costPrice: product ? parseFloat(product.costPrice as string) : 0,
      };
    });

    const subtotal = round2(subtotalRaw);
    const total = round2(subtotal - discount);
    const invoiceNumber = `INV-${Date.now()}`;
    const status = body.status || "completed";
    const invoiceDate = new Date();

    const sale = await db.transaction(async (tx) => {
      // Deduct stock for completed sales.
      if (status === "completed") {
        for (const item of items) {
          await tx.update(productsTable).set({
            currentStock: sql`${productsTable.currentStock} - ${item.quantity}`,
          }).where(eq(productsTable.id, item.productId));
        }
      }

      const [insertedSale] = await tx.insert(salesTable).values({
        invoiceNumber,
        customerId: body.customerId ?? null,
        customerName: body.customerName,
        status,
        subtotal: String(subtotal),
        discount: String(discount),
        total: String(total),
        notes: body.notes ?? null,
        items: items.map(({ productId, productName, quantity, unitPrice, total }) => ({ productId, productName, quantity, unitPrice, total })),
      }).returning();

      // Customer Price History + Ledger — only meaningful for a registered
      // customer (walk-in/anonymous sales have no khata to update).
      if (body.customerId && status === "completed") {
        for (const item of items) {
          const profitAmount = round2(item.finalPrice - item.costPrice * item.quantity);
          const profitPercentage = item.finalPrice > 0 ? round2((profitAmount / item.finalPrice) * 100) : 0;

          await tx.insert(priceHistoryTable).values({
            customerId: body.customerId,
            productId: item.productId,
            productName: item.productName,
            sku: item.sku,
            saleId: insertedSale.id,
            invoiceNumber,
            invoiceDate,
            quantity: String(item.quantity),
            unitPrice: String(item.unitPrice),
            discount: String(item.lineDiscount),
            finalPrice: String(item.finalPrice),
            costPrice: String(item.costPrice),
            profitAmount: String(profitAmount),
            profitPercentage: String(profitPercentage),
            createdByUserId,
          });
        }

        await appendLedgerEntry(tx, {
          customerId: body.customerId,
          type: "sale",
          amount: total,
          saleId: insertedSale.id,
          description: `Invoice ${invoiceNumber}`,
          createdByUserId,
          entryDate: invoiceDate,
        });
      }

      return insertedSale;
    });

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
    const createdByUserId = getUserIdFromRequest(req);
    const [existingSale] = await db.select().from(salesTable).where(eq(salesTable.id, id));
    if (!existingSale) return res.status(404).json({ error: "Sale not found" });

    const updateData: Record<string, unknown> = {};
    if (body.status !== undefined) updateData.status = body.status;
    if (body.discount !== undefined) updateData.discount = String(body.discount);
    if (body.notes !== undefined) updateData.notes = body.notes;

    const sale = await db.transaction(async (tx) => {
      if (body.status !== undefined && body.status !== existingSale.status) {
        if (existingSale.status === "completed" && body.status !== "completed") {
          await adjustSaleStock(existingSale, 1, tx);
          // Reverse the receivable this sale created — the invoice is no
          // longer "completed" so it shouldn't count toward the customer's
          // outstanding balance.
          if (existingSale.customerId) {
            await appendLedgerEntry(tx, {
              customerId: existingSale.customerId,
              type: "adjustment",
              amount: -parseFloat(existingSale.total as string),
              saleId: existingSale.id,
              description: `Invoice ${existingSale.invoiceNumber} status changed from completed to ${body.status}`,
              createdByUserId,
            });
          }
        } else if (existingSale.status !== "completed" && body.status === "completed") {
          await adjustSaleStock(existingSale, -1, tx);
          if (existingSale.customerId) {
            await appendLedgerEntry(tx, {
              customerId: existingSale.customerId,
              type: "adjustment",
              amount: parseFloat(existingSale.total as string),
              saleId: existingSale.id,
              description: `Invoice ${existingSale.invoiceNumber} status changed to completed`,
              createdByUserId,
            });
          }
        }
      }

      const [updated] = await tx.update(salesTable).set(updateData).where(eq(salesTable.id, id)).returning();
      return updated;
    });

    return res.json(formatSale(sale));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to update sale" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const createdByUserId = getUserIdFromRequest(req);
    const [existingSale] = await db.select().from(salesTable).where(eq(salesTable.id, id));
    if (!existingSale) return res.status(404).json({ error: "Sale not found" });

    await db.transaction(async (tx) => {
      // Financial records should never be deleted silently — if this
      // invoice affected a customer's khata, reverse it with an explicit,
      // auditable ledger adjustment before removing the invoice row.
      if (existingSale.customerId && existingSale.status === "completed") {
        await appendLedgerEntry(tx, {
          customerId: existingSale.customerId,
          type: "adjustment",
          amount: -parseFloat(existingSale.total as string),
          saleId: existingSale.id,
          description: `Invoice ${existingSale.invoiceNumber} deleted`,
          createdByUserId,
        });
        await adjustSaleStock(existingSale, 1, tx);
      }
      await tx.delete(salesTable).where(eq(salesTable.id, id));
    });

    res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to delete sale" });
  }
});

export default router;
