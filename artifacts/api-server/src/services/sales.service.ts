import { db } from "@workspace/db";
import { salesTable, productsTable, priceHistoryTable } from "@workspace/db";
import { eq, sql, inArray } from "drizzle-orm";
import { appendLedgerEntry, round2 } from "../lib/ledger.js";
import { appendGeneralLedgerEntry } from "../lib/general-ledger.js";

export async function listSales(params: Record<string, any>) {
  const search = params.search as string | undefined;
  const status = params.status as string | undefined;
  const page = Number(params.page) || 1;
  const limit = Number(params.limit) || 20;
  const offset = (page - 1) * limit;

  const conditions: any[] = [];
  if (search) conditions.push(sql`customer_name ILIKE ${`%${search}%`}`);
  if (status) conditions.push(sql`status = ${status}`);

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(salesTable).where(conditions.length ? sql`${sql.join(conditions, ' AND ')}` : undefined as any);
  const rows = await db.select().from(salesTable).where(conditions.length ? sql`${sql.join(conditions, ' AND ')}` : undefined as any).orderBy(sql`${salesTable.createdAt} DESC`).limit(limit).offset(offset);
  return { data: rows.map((r) => r), total: Number(count), page, limit };
}

export async function createSale(body: any, actorUserId: number | null) {
  // prepare products and items
  const productIds = Array.from(new Set(body.items.map((i: any) => Number(i.productId)))) as number[];
  const products = productIds.length ? await db.select({ id: productsTable.id, name: productsTable.name, sku: productsTable.sku, costPrice: productsTable.costPrice }).from(productsTable).where(inArray(productsTable.id, productIds)) : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  const subtotalRaw = body.items.reduce((sum: number, i: any) => sum + i.quantity * i.unitPrice, 0);
  const discount = body.discount || 0;
  const items = body.items.map((item: any) => {
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
  const invoiceDate = body.saleDate ? new Date(body.saleDate) : new Date();

  const sale = await db.transaction(async (tx) => {
    if (status === "completed") {
      for (const item of items) {
        await tx.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} - ${item.quantity}` }).where(eq(productsTable.id, item.productId));
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
      items: items.map(({ productId, productName, quantity, unitPrice, total: t }) => ({ productId, productName, quantity, unitPrice, total: t })),
      saleDate: invoiceDate,
    }).returning();

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
          createdByUserId: actorUserId,
        });
      }

      await appendLedgerEntry(tx, {
        customerId: body.customerId,
        type: "sale",
        amount: total,
        saleId: insertedSale.id,
        description: `Invoice ${invoiceNumber}`,
        createdByUserId: actorUserId,
        entryDate: invoiceDate,
      });
    }

    if (status === "completed") {
      await appendGeneralLedgerEntry(tx, {
        date: invoiceDate,
        type: "sale",
        referenceId: insertedSale.id,
        partyType: body.customerId ? "customer" : "none",
        partyId: body.customerId ?? null,
        partyName: body.customerName,
        amount: total,
        direction: "credit",
        note: `Invoice ${invoiceNumber}`,
        createdByUserId: actorUserId,
      });
    }

    return insertedSale;
  });

  return sale;
}

export async function updateSale(id: number, body: any, actorUserId: number | null) {
  const [existingSale] = await db.select().from(salesTable).where(eq(salesTable.id, id));
  if (!existingSale) throw new Error("Sale not found");

  const updateData: Record<string, unknown> = {};
  if (body.status !== undefined) updateData.status = body.status;
  if (body.discount !== undefined) updateData.discount = String(body.discount);
  if (body.notes !== undefined) updateData.notes = body.notes;

  const sale = await db.transaction(async (tx) => {
    if (body.status !== undefined && body.status !== existingSale.status) {
      if (existingSale.status === "completed" && body.status !== "completed") {
        // restore stock
        const items = existingSale.items as Array<any>;
        for (const item of items) {
          await tx.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} + ${item.quantity}` }).where(eq(productsTable.id, item.productId));
        }
        if (existingSale.customerId) {
          await appendLedgerEntry(tx, {
            customerId: existingSale.customerId,
            type: "adjustment",
            amount: -parseFloat(existingSale.total as string),
            saleId: existingSale.id,
            description: `Invoice ${existingSale.invoiceNumber} status changed from completed to ${body.status}`,
            createdByUserId: actorUserId,
          });
        }
      } else if (existingSale.status !== "completed" && body.status === "completed") {
        const items = existingSale.items as Array<any>;
        for (const item of items) {
          await tx.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} - ${item.quantity}` }).where(eq(productsTable.id, item.productId));
        }
        if (existingSale.customerId) {
          await appendLedgerEntry(tx, {
            customerId: existingSale.customerId,
            type: "adjustment",
            amount: parseFloat(existingSale.total as string),
            saleId: existingSale.id,
            description: `Invoice ${existingSale.invoiceNumber} status changed to completed`,
            createdByUserId: actorUserId,
          });
        }
      }
    }

    const [updated] = await tx.update(salesTable).set(updateData).where(eq(salesTable.id, id)).returning();
    return updated;
  });

  return sale;
}

export async function deleteSale(id: number, actorUserId: number | null) {
  const [existingSale] = await db.select().from(salesTable).where(eq(salesTable.id, id));
  if (!existingSale) throw new Error("Sale not found");

  await db.transaction(async (tx) => {
    if (existingSale.customerId && existingSale.status === "completed") {
      await appendLedgerEntry(tx, {
        customerId: existingSale.customerId,
        type: "adjustment",
        amount: -parseFloat(existingSale.total as string),
        saleId: existingSale.id,
        description: `Invoice ${existingSale.invoiceNumber} deleted`,
        createdByUserId: actorUserId,
      });
      const items = existingSale.items as Array<any>;
      for (const item of items) {
        await tx.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} + ${item.quantity}` }).where(eq(productsTable.id, item.productId));
      }
    }
    await tx.delete(salesTable).where(eq(salesTable.id, id));
  });
}

export default { listSales, createSale, updateSale, deleteSale };
