import { db } from "@workspace/db";
import { purchasesTable, productsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { appendSupplierLedgerEntry } from "../lib/supplier-ledger.js";
import { appendGeneralLedgerEntry } from "../lib/general-ledger.js";

export async function listPurchases(params: Record<string, any>) {
  const search = params.search as string | undefined;
  const status = params.status as string | undefined;
  const page = Number(params.page) || 1;
  const limit = Number(params.limit) || 20;
  const offset = (page - 1) * limit;

  const conditions: any[] = [];
  if (search) conditions.push(sql`supplier_name ILIKE ${`%${search}%`}`);
  if (status) conditions.push(sql`status = ${status}`);

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(purchasesTable).where(conditions.length ? sql`${sql.join(conditions, ' AND ')}` : undefined as any);
  const rows = await db.select().from(purchasesTable).where(conditions.length ? sql`${sql.join(conditions, ' AND ')}` : undefined as any).orderBy(sql`${purchasesTable.createdAt} DESC`).limit(limit).offset(offset);
  return { data: rows.map((r) => r), total: Number(count), page, limit };
}

export async function createPurchase(body: any, actorUserId: number | null) {
  const purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : new Date();

  const items = body.items.map((item: any) => ({ productId: item.productId, productName: "", quantity: item.quantity, unitCost: item.unitCost, total: item.quantity * item.unitCost }));
  for (const item of items) {
    const [product] = await db.select({ name: productsTable.name }).from(productsTable).where(eq(productsTable.id, item.productId));
    if (product) item.productName = product.name;
  }

  if (!body.status || body.status === "received") {
    for (const item of items) {
      await db.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} + ${item.quantity}` }).where(eq(productsTable.id, item.productId));
    }
  }

  const subtotal = items.reduce((sum: number, i: any) => sum + i.total, 0);
  const poNumber = `PO-${Date.now()}`;

  const purchase = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(purchasesTable).values({
      poNumber,
      supplierId: body.supplierId ?? null,
      supplierName: body.supplierName,
      status: body.status || "received",
      subtotal: String(subtotal),
      total: String(subtotal),
      notes: body.notes ?? null,
      items: items,
      purchaseDate,
    }).returning();

    if (body.supplierId) {
      const ledgerEntry = await appendSupplierLedgerEntry(tx, {
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
      void ledgerEntry;
    }

    return inserted;
  });

  return purchase;
}

export async function updatePurchase(id: number, body: any, actorUserId: number | null) {
  const [existingPurchase] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, id));
  if (!existingPurchase) throw new Error("Purchase not found");

  const updateData: Record<string, unknown> = {};
  if (body.status !== undefined) updateData.status = body.status;
  if (body.notes !== undefined) updateData.notes = body.notes;

  if (body.status !== undefined && body.status !== existingPurchase.status) {
    if (existingPurchase.status === "received" && body.status !== "received") {
      const items = existingPurchase.items as Array<any>;
      for (const item of items) {
        await db.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} - ${item.quantity}` }).where(eq(productsTable.id, item.productId));
      }
    } else if (existingPurchase.status !== "received" && body.status === "received") {
      const items = existingPurchase.items as Array<any>;
      for (const item of items) {
        await db.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} + ${item.quantity}` }).where(eq(productsTable.id, item.productId));
      }
    }
  }

  const [purchase] = await db.update(purchasesTable).set(updateData).where(eq(purchasesTable.id, id)).returning();
  return purchase;
}

export async function deletePurchase(id: number, actorUserId: number | null) {
  const [existingPurchase] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, id));
  if (!existingPurchase) throw new Error("Purchase not found");

  if (existingPurchase.status === "received") {
    const items = existingPurchase.items as Array<any>;
    for (const item of items) {
      await db.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} - ${item.quantity}` }).where(eq(productsTable.id, item.productId));
    }
  }

  await db.delete(purchasesTable).where(eq(purchasesTable.id, id));
}

export default { listPurchases, createPurchase, updatePurchase, deletePurchase };
