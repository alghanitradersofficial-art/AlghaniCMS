import { db } from "@workspace/db";
import { salesTable, productsTable, priceHistoryTable } from "@workspace/db";
import { eq, sql, inArray } from "drizzle-orm";
import { appendLedgerEntry, round2 } from "../lib/ledger.js";
import { appendGeneralLedgerEntry } from "../lib/general-ledger.js";
import { assertPeriodOpen, markPeriodDirty } from "../lib/period-lock.js";

export async function listSales(params: Record<string, any>) {
  const search = params.search as string | undefined;
  const status = params.status as string | undefined;
  const id = params.id as number | undefined;
  const from = params.from as string | undefined;
  const to = params.to as string | undefined;
  const page = Number(params.page) || 1;
  const limit = Number(params.limit) || 20;
  const offset = (page - 1) * limit;

  const conditions: any[] = [];
  if (id) conditions.push(sql`id = ${id}`);
  if (search) conditions.push(sql`customer_name ILIKE ${`%${search}%`}`);
  if (status) conditions.push(sql`status = ${status}`);
  if (from) conditions.push(sql`sale_date >= ${new Date(from)}`);
  if (to) conditions.push(sql`sale_date <= ${new Date(new Date(to).setHours(23, 59, 59, 999))}`);

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(salesTable).where(conditions.length ? sql`${sql.join(conditions, ' AND ')}` : undefined as any);
  const rows = await db.select().from(salesTable).where(conditions.length ? sql`${sql.join(conditions, ' AND ')}` : undefined as any).orderBy(sql`${salesTable.saleDate} DESC`).limit(limit).offset(offset);
  return { data: rows.map((r) => r), total: Number(count), page, limit };
}

// Builds the priced line-item shape (name/sku/cost/profit resolved) shared
// by both createSale and updateSale, so both paths compute totals and
// price-history the exact same way.
async function priceItems(rawItems: Array<{ productId: number; quantity: number; unitPrice: number }>, discount: number) {
  const productIds = Array.from(new Set(rawItems.map((i) => Number(i.productId)))) as number[];
  const products = productIds.length ? await db.select({ id: productsTable.id, name: productsTable.name, sku: productsTable.sku, costPrice: productsTable.costPrice }).from(productsTable).where(inArray(productsTable.id, productIds)) : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  const subtotalRaw = rawItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const items = rawItems.map((item) => {
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

  return { items, subtotal: round2(subtotalRaw) };
}

export async function createSale(body: any, actorUserId: number | null) {
  const invoiceDate = body.saleDate ? new Date(body.saleDate) : new Date();
  await assertPeriodOpen(invoiceDate);

  const discount = body.discount || 0;
  const { items, subtotal } = await priceItems(body.items, discount);
  const total = round2(subtotal - discount);
  const invoiceNumber = `INV-${Date.now()}`;
  const status = body.status || "completed";

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

/**
 * Full sale edit: status, discount, notes, AND line items (products,
 * quantities, prices). When items/discount change on a completed sale,
 * this:
 *   1. Reverses the old stock deduction, applies the new one (delta-based,
 *      so a product removed from the invoice gets its stock restored and a
 *      product added gets it deducted).
 *   2. Deletes the old price-history rows for this invoice and re-inserts
 *      fresh ones for the new items, so customer price history always
 *      reflects what the invoice actually says now — never stale rows from
 *      before the edit.
 *   3. Posts a single ledger "adjustment" entry for the difference between
 *      the old and new invoice total, instead of trying to unwind and
 *      replay the whole history — keeps the running balance correct with
 *      one entry per edit.
 *   4. Refuses to touch a sale whose date falls in a closed month — the
 *      month must be reopened first — and flags the period dirty if the
 *      edit happens after a reopen, since the closing snapshot is now
 *      stale.
 */
export async function updateSale(id: number, body: any, actorUserId: number | null) {
  const [existingSale] = await db.select().from(salesTable).where(eq(salesTable.id, id));
  if (!existingSale) throw new Error("Sale not found");

  const existingSaleDate = (existingSale.saleDate ?? existingSale.createdAt) as Date;
  await assertPeriodOpen(existingSaleDate);
  const newSaleDate = body.saleDate ? new Date(body.saleDate) : existingSaleDate;
  if (body.saleDate) await assertPeriodOpen(newSaleDate);

  const hasItemsEdit = Array.isArray(body.items);
  const existingItems = (existingSale.items as Array<any>) || [];
  const discount = body.discount !== undefined ? Number(body.discount) : parseFloat(existingSale.discount as string);

  let newItems = existingItems;
  let newSubtotal = parseFloat(existingSale.subtotal as string);
  let pricedItems: Awaited<ReturnType<typeof priceItems>>["items"] = [];

  if (hasItemsEdit) {
    const priced = await priceItems(body.items, discount);
    pricedItems = priced.items;
    newItems = priced.items.map(({ productId, productName, quantity, unitPrice, total: t }) => ({ productId, productName, quantity, unitPrice, total: t }));
    newSubtotal = priced.subtotal;
  }

  const newTotal = round2(newSubtotal - discount);
  const nextStatus = body.status !== undefined ? body.status : existingSale.status;

  const updateData: Record<string, unknown> = {};
  if (body.status !== undefined) updateData.status = body.status;
  if (body.notes !== undefined) updateData.notes = body.notes;
  if (body.discount !== undefined || hasItemsEdit) {
    updateData.discount = String(discount);
    updateData.subtotal = String(newSubtotal);
    updateData.total = String(newTotal);
  }
  if (hasItemsEdit) updateData.items = newItems;
  if (body.saleDate) updateData.saleDate = newSaleDate;

  const sale = await db.transaction(async (tx) => {
    const wasCompleted = existingSale.status === "completed";
    const willBeCompleted = nextStatus === "completed";

    // --- Stock reconciliation ---------------------------------------
    // Build a per-product delta so we issue exactly one stock update per
    // affected product, covering every combination of status flip + item
    // change in a single pass.
    const stockDelta = new Map<number, number>();
    const addDelta = (productId: number, qty: number) => stockDelta.set(productId, (stockDelta.get(productId) ?? 0) + qty);

    if (wasCompleted && !willBeCompleted) {
      // Fully reversing: restore everything that was deducted.
      for (const item of existingItems) addDelta(item.productId, item.quantity);
    } else if (!wasCompleted && willBeCompleted) {
      // Newly completing: deduct the (possibly edited) new items.
      const itemsToDeduct = hasItemsEdit ? newItems : existingItems;
      for (const item of itemsToDeduct as Array<any>) addDelta(item.productId, -item.quantity);
    } else if (wasCompleted && willBeCompleted && hasItemsEdit) {
      // Still completed, but the item list changed: restore the old
      // quantities and deduct the new ones (net effect = the difference).
      for (const item of existingItems) addDelta(item.productId, item.quantity);
      for (const item of newItems as Array<any>) addDelta(item.productId, -item.quantity);
    }
    // (not completed before or after → no stock movement either way)

    for (const [productId, delta] of stockDelta) {
      if (delta === 0) continue;
      await tx.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} + ${delta}` }).where(eq(productsTable.id, productId));
    }

    // --- Ledger reconciliation --------------------------------------
    if (existingSale.customerId) {
      if (wasCompleted && !willBeCompleted) {
        await appendLedgerEntry(tx, {
          customerId: existingSale.customerId,
          type: "adjustment",
          amount: -parseFloat(existingSale.total as string),
          saleId: existingSale.id,
          description: `Invoice ${existingSale.invoiceNumber} status changed from completed to ${nextStatus}`,
          createdByUserId: actorUserId,
        });
      } else if (!wasCompleted && willBeCompleted) {
        await appendLedgerEntry(tx, {
          customerId: existingSale.customerId,
          type: "adjustment",
          amount: newTotal,
          saleId: existingSale.id,
          description: `Invoice ${existingSale.invoiceNumber} status changed to completed`,
          createdByUserId: actorUserId,
        });
      } else if (wasCompleted && willBeCompleted) {
        const oldTotal = parseFloat(existingSale.total as string);
        const diff = round2(newTotal - oldTotal);
        if (diff !== 0) {
          await appendLedgerEntry(tx, {
            customerId: existingSale.customerId,
            type: "adjustment",
            amount: diff,
            saleId: existingSale.id,
            description: `Invoice ${existingSale.invoiceNumber} edited (total changed by Rs. ${diff})`,
            createdByUserId: actorUserId,
          });
        }
      }
    }

    // --- Price history reconciliation -------------------------------
    // Only rewrite price-history rows when items actually changed on a
    // completed, customer-linked sale — never touch history for a pure
    // status/notes edit.
    if (hasItemsEdit && existingSale.customerId && willBeCompleted) {
      await tx.delete(priceHistoryTable).where(eq(priceHistoryTable.saleId, existingSale.id));
      for (const item of pricedItems) {
        const profitAmount = round2(item.finalPrice - item.costPrice * item.quantity);
        const profitPercentage = item.finalPrice > 0 ? round2((profitAmount / item.finalPrice) * 100) : 0;
        await tx.insert(priceHistoryTable).values({
          customerId: existingSale.customerId,
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          saleId: existingSale.id,
          invoiceNumber: existingSale.invoiceNumber,
          invoiceDate: newSaleDate,
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
    }

    // --- General ledger feed ------------------------------------------
    if ((wasCompleted !== willBeCompleted) || (wasCompleted && willBeCompleted && hasItemsEdit)) {
      await appendGeneralLedgerEntry(tx, {
        date: newSaleDate,
        type: "adjustment",
        referenceId: existingSale.id,
        partyType: existingSale.customerId ? "customer" : "none",
        partyId: existingSale.customerId,
        partyName: existingSale.customerName,
        amount: willBeCompleted ? newTotal : parseFloat(existingSale.total as string),
        direction: willBeCompleted ? "credit" : "debit",
        note: `Invoice ${existingSale.invoiceNumber} edited`,
        createdByUserId: actorUserId,
      });
    }

    // If this sale's date falls in an already-closed period (only possible
    // if that period was explicitly reopened first — assertPeriodOpen above
    // would have thrown otherwise), flag it dirty so the Months page shows
    // the closing snapshot is now stale and should be recomputed.
    await markPeriodDirty(existingSaleDate, tx);
    if (body.saleDate) await markPeriodDirty(newSaleDate, tx);

    const [updated] = await tx.update(salesTable).set(updateData).where(eq(salesTable.id, id)).returning();
    return updated;
  });

  return sale;
}

export async function deleteSale(id: number, actorUserId: number | null) {
  const [existingSale] = await db.select().from(salesTable).where(eq(salesTable.id, id));
  if (!existingSale) throw new Error("Sale not found");

  const saleDate = (existingSale.saleDate ?? existingSale.createdAt) as Date;
  await assertPeriodOpen(saleDate);

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
      await appendGeneralLedgerEntry(tx, {
        date: saleDate,
        type: "adjustment",
        referenceId: existingSale.id,
        partyType: "customer",
        partyId: existingSale.customerId,
        partyName: existingSale.customerName,
        amount: parseFloat(existingSale.total as string),
        direction: "debit",
        note: `Invoice ${existingSale.invoiceNumber} deleted`,
        createdByUserId: actorUserId,
      });
    }
    await tx.delete(priceHistoryTable).where(eq(priceHistoryTable.saleId, existingSale.id));
    await markPeriodDirty(saleDate, tx);
    await tx.delete(salesTable).where(eq(salesTable.id, id));
  });
}

export default { listSales, createSale, updateSale, deleteSale };
