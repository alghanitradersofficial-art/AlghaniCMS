import { db } from "@workspace/db";
import { purchasesTable, productsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { appendSupplierLedgerEntry } from "../lib/supplier-ledger.js";
import { appendGeneralLedgerEntry } from "../lib/general-ledger.js";
import { assertPeriodOpen, markPeriodDirty } from "../lib/period-lock.js";

export async function listPurchases(params: Record<string, any>) {
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
  if (search) conditions.push(sql`supplier_name ILIKE ${`%${search}%`}`);
  if (status) conditions.push(sql`status = ${status}`);
  if (from) conditions.push(sql`purchase_date >= ${new Date(from)}`);
  if (to) conditions.push(sql`purchase_date <= ${new Date(new Date(to).setHours(23, 59, 59, 999))}`);

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(purchasesTable).where(conditions.length ? sql`${sql.join(conditions, ' AND ')}` : undefined as any);
  const rows = await db.select().from(purchasesTable).where(conditions.length ? sql`${sql.join(conditions, ' AND ')}` : undefined as any).orderBy(sql`${purchasesTable.purchaseDate} DESC`).limit(limit).offset(offset);
  return { data: rows.map((r) => r), total: Number(count), page, limit };
}

async function nameItems(rawItems: Array<{ productId: number; quantity: number; unitCost: number }>) {
  const items = rawItems.map((item) => ({ productId: item.productId, productName: "", quantity: item.quantity, unitCost: item.unitCost, total: item.quantity * item.unitCost }));
  for (const item of items) {
    const [product] = await db.select({ name: productsTable.name }).from(productsTable).where(eq(productsTable.id, item.productId));
    if (product) item.productName = product.name;
  }
  const subtotal = items.reduce((sum, i) => sum + i.total, 0);
  return { items, subtotal };
}

export async function createPurchase(body: any, actorUserId: number | null) {
  const purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : new Date();
  await assertPeriodOpen(purchaseDate);

  const { items, subtotal } = await nameItems(body.items);
  const poNumber = `PO-${Date.now()}`;
  const status = body.status || "received";

  if (status === "received") {
    for (const item of items) {
      await db.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} + ${item.quantity}` }).where(eq(productsTable.id, item.productId));
    }
  }

  const purchase = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(purchasesTable).values({
      poNumber,
      supplierId: body.supplierId ?? null,
      supplierName: body.supplierName,
      status,
      subtotal: String(subtotal),
      total: String(subtotal),
      notes: body.notes ?? null,
      items,
      purchaseDate,
    }).returning();

    if (body.supplierId) {
      await appendSupplierLedgerEntry(tx, {
        supplierId: body.supplierId,
        type: "purchase",
        amount: subtotal,
        purchaseId: inserted.id,
        description: `Purchase — ${poNumber}`,
        createdByUserId: actorUserId,
        entryDate: purchaseDate,
      });

      await appendGeneralLedgerEntry(tx, {
        date: purchaseDate,
        type: "purchase",
        referenceId: inserted.id,
        partyType: "supplier",
        partyId: body.supplierId,
        partyName: body.supplierName,
        amount: subtotal,
        direction: "debit",
        note: `PO ${poNumber}`,
        createdByUserId: actorUserId,
      });
    }

    return inserted;
  });

  return purchase;
}

/**
 * Full purchase edit: status, notes, AND line items (products, quantities,
 * unit costs). Mirrors sales.service.ts updateSale — see that function's
 * doc comment for the full reconciliation rationale. Key differences here:
 * stock moves in the OPPOSITE direction of a sale (receiving more stock
 * increases it), and the ledger entries go through the supplier ledger
 * instead of the customer ledger. There's no price-history table for
 * purchases (that's a customer-side khata feature) so this only reconciles
 * stock and the supplier ledger.
 */
export async function updatePurchase(id: number, body: any, actorUserId: number | null) {
  const [existingPurchase] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, id));
  if (!existingPurchase) throw new Error("Purchase not found");

  const existingDate = existingPurchase.purchaseDate as Date;
  await assertPeriodOpen(existingDate);
  const newDate = body.purchaseDate ? new Date(body.purchaseDate) : existingDate;
  if (body.purchaseDate) await assertPeriodOpen(newDate);

  const hasItemsEdit = Array.isArray(body.items);
  const existingItems = (existingPurchase.items as Array<any>) || [];

  let newItems = existingItems;
  let newSubtotal = parseFloat(existingPurchase.subtotal as string);

  if (hasItemsEdit) {
    const named = await nameItems(body.items);
    newItems = named.items;
    newSubtotal = named.subtotal;
  }

  const nextStatus = body.status !== undefined ? body.status : existingPurchase.status;

  const updateData: Record<string, unknown> = {};
  if (body.status !== undefined) updateData.status = body.status;
  if (body.notes !== undefined) updateData.notes = body.notes;
  if (hasItemsEdit) {
    updateData.items = newItems;
    updateData.subtotal = String(newSubtotal);
    updateData.total = String(newSubtotal);
  }
  if (body.purchaseDate) updateData.purchaseDate = newDate;

  const purchase = await db.transaction(async (tx) => {
    const wasReceived = existingPurchase.status === "received";
    const willBeReceived = nextStatus === "received";

    const stockDelta = new Map<number, number>();
    const addDelta = (productId: number, qty: number) => stockDelta.set(productId, (stockDelta.get(productId) ?? 0) + qty);

    if (wasReceived && !willBeReceived) {
      for (const item of existingItems) addDelta(item.productId, -item.quantity);
    } else if (!wasReceived && willBeReceived) {
      const itemsToAdd = hasItemsEdit ? newItems : existingItems;
      for (const item of itemsToAdd as Array<any>) addDelta(item.productId, item.quantity);
    } else if (wasReceived && willBeReceived && hasItemsEdit) {
      for (const item of existingItems) addDelta(item.productId, -item.quantity);
      for (const item of newItems as Array<any>) addDelta(item.productId, item.quantity);
    }

    for (const [productId, delta] of stockDelta) {
      if (delta === 0) continue;
      await tx.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} + ${delta}` }).where(eq(productsTable.id, productId));
    }

    if (existingPurchase.supplierId) {
      const oldTotal = parseFloat(existingPurchase.total as string);
      const newTotal = round2(newSubtotal);

      if (wasReceived && !willBeReceived) {
        await appendSupplierLedgerEntry(tx, {
          supplierId: existingPurchase.supplierId,
          type: "adjustment",
          amount: -oldTotal,
          purchaseId: existingPurchase.id,
          description: `PO ${existingPurchase.poNumber} status changed from received to ${nextStatus}`,
          createdByUserId: actorUserId,
        });
      } else if (!wasReceived && willBeReceived) {
        await appendSupplierLedgerEntry(tx, {
          supplierId: existingPurchase.supplierId,
          type: "adjustment",
          amount: newTotal,
          purchaseId: existingPurchase.id,
          description: `PO ${existingPurchase.poNumber} status changed to received`,
          createdByUserId: actorUserId,
        });
      } else if (wasReceived && willBeReceived) {
        const diff = round2(newTotal - oldTotal);
        if (diff !== 0) {
          await appendSupplierLedgerEntry(tx, {
            supplierId: existingPurchase.supplierId,
            type: "adjustment",
            amount: diff,
            purchaseId: existingPurchase.id,
            description: `PO ${existingPurchase.poNumber} edited (total changed by Rs. ${diff})`,
            createdByUserId: actorUserId,
          });
        }
      }

      if ((wasReceived !== willBeReceived) || (wasReceived && willBeReceived && hasItemsEdit)) {
        await appendGeneralLedgerEntry(tx, {
          date: newDate,
          type: "adjustment",
          referenceId: existingPurchase.id,
          partyType: "supplier",
          partyId: existingPurchase.supplierId,
          partyName: existingPurchase.supplierName,
          amount: willBeReceived ? newTotal : oldTotal,
          direction: willBeReceived ? "debit" : "credit",
          note: `PO ${existingPurchase.poNumber} edited`,
          createdByUserId: actorUserId,
        });
      }
    }

    await markPeriodDirty(existingDate, tx);
    if (body.purchaseDate) await markPeriodDirty(newDate, tx);

    const [updated] = await tx.update(purchasesTable).set(updateData).where(eq(purchasesTable.id, id)).returning();
    return updated;
  });

  return purchase;
}

export async function deletePurchase(id: number, actorUserId: number | null) {
  const [existingPurchase] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, id));
  if (!existingPurchase) throw new Error("Purchase not found");

  const purchaseDate = existingPurchase.purchaseDate as Date;
  await assertPeriodOpen(purchaseDate);

  await db.transaction(async (tx) => {
    if (existingPurchase.status === "received") {
      const items = existingPurchase.items as Array<any>;
      for (const item of items) {
        await tx.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} - ${item.quantity}` }).where(eq(productsTable.id, item.productId));
      }
      if (existingPurchase.supplierId) {
        await appendSupplierLedgerEntry(tx, {
          supplierId: existingPurchase.supplierId,
          type: "adjustment",
          amount: -parseFloat(existingPurchase.total as string),
          purchaseId: existingPurchase.id,
          description: `PO ${existingPurchase.poNumber} deleted`,
          createdByUserId: actorUserId,
        });
        await appendGeneralLedgerEntry(tx, {
          date: purchaseDate,
          type: "adjustment",
          referenceId: existingPurchase.id,
          partyType: "supplier",
          partyId: existingPurchase.supplierId,
          partyName: existingPurchase.supplierName,
          amount: parseFloat(existingPurchase.total as string),
          direction: "credit",
          note: `PO ${existingPurchase.poNumber} deleted`,
          createdByUserId: actorUserId,
        });
      }
    }
    await markPeriodDirty(purchaseDate, tx);
    await tx.delete(purchasesTable).where(eq(purchasesTable.id, id));
  });
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export default { listPurchases, createPurchase, updatePurchase, deletePurchase };
