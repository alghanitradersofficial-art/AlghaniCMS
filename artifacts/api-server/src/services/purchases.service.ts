import { db } from "@workspace/db";
import { purchasesTable, productsTable, supplierPaymentsTable, suppliersTable, supplierProductsTable, supplierLedgerEntriesTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { appendSupplierLedgerEntry } from "../lib/supplier-ledger.js";
import { appendGeneralLedgerEntry } from "../lib/general-ledger.js";
import { calculateWeightedAverageCost, calculateWeightedAverageCostAfterChange } from "../lib/inventory-accounting.js";
import { round2 } from "../lib/ledger.js";
import { isDateInClosedPeriod, MonthClosedError } from "./months.service.js";

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

  if (await isDateInClosedPeriod(purchaseDate)) {
    throw new MonthClosedError(purchaseDate);
  }

  const items = body.items.map((item: any) => ({ productId: item.productId, productName: "", quantity: item.quantity, unitCost: item.unitCost, total: item.quantity * item.unitCost }));
  for (const item of items) {
    const [product] = await db.select({ name: productsTable.name, currentStock: productsTable.currentStock, costPrice: productsTable.costPrice }).from(productsTable).where(eq(productsTable.id, item.productId));
    if (product) {
      item.productName = product.name;
      const nextAverageCost = calculateWeightedAverageCost({
        currentStock: Number(product.currentStock ?? 0),
        averageCost: Number(product.costPrice ?? 0),
        quantity: Number(item.quantity ?? 0),
        unitCost: Number(item.unitCost ?? 0),
      });
      item.averageCost = nextAverageCost;
    }
  }

  if (!body.status || body.status === "received") {
    for (const item of items) {
      const currentAverageCost = item.averageCost ?? item.unitCost;
      await db.update(productsTable)
        .set({
          currentStock: sql`${productsTable.currentStock} + ${item.quantity}`,
          costPrice: String(currentAverageCost),
        })
        .where(eq(productsTable.id, item.productId));
    }
  }

  const subtotal = items.reduce((sum: number, i: any) => sum + i.total, 0);
  const poNumber = `PO-${Date.now()}`;

  // Cash actually paid out right now, as opposed to the PO total. Purchases
  // with no supplier on record (nobody to owe later) are always treated as
  // paid in full immediately. Purchases against a khata supplier default to
  // zero paid now (pure credit purchase) unless told otherwise, and can be
  // any amount up to the PO total (partial payment at time of purchase).
  const paidNow = body.supplierId
    ? round2(Math.max(0, Math.min(Number(body.amountPaidNow) || 0, subtotal)))
    : subtotal;
  const paymentMethod = body.paymentMethod || "cash";

  const purchase = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(purchasesTable).values({
      poNumber,
      supplierId: body.supplierId ?? null,
      supplierName: body.supplierName,
      status: body.status || "received",
      subtotal: String(subtotal),
      total: String(subtotal),
      // Cash paid at the counter is recorded immediately; the rest stays
      // outstanding on the supplier's khata until a later payment.
      amountPaid: String(body.supplierId ? paidNow : 0),
      notes: body.notes ?? null,
      items: items,
      purchaseDate,
    }).returning();

    if (body.supplierId) {
      // Before recording this purchase, check whether the supplier already
      // carries credit in our favor (e.g. from an earlier sale-return/claim
      // credit, or a manual adjustment) sitting unapplied on their ledger.
      // If so, recognize it against this new PO's amountPaid right away.
      // Without this, the overall ledger balance ("We Owe") is correct the
      // moment the new purchase + existing credit net out, but this
      // specific PO's own amountPaid stays 0 — so the Outstanding card
      // (which sums total - amountPaid per PO) still shows it as unpaid
      // even though nothing is actually owed anymore.
      const [lastEntry] = await tx
        .select({ runningBalance: supplierLedgerEntriesTable.runningBalance })
        .from(supplierLedgerEntriesTable)
        .where(eq(supplierLedgerEntriesTable.supplierId, body.supplierId))
        .orderBy(desc(supplierLedgerEntriesTable.id))
        .limit(1);
      const [supplierRow] = await tx
        .select({ openingBalance: suppliersTable.openingBalance })
        .from(suppliersTable)
        .where(eq(suppliersTable.id, body.supplierId));
      const preBalance = lastEntry
        ? parseFloat(lastEntry.runningBalance as string)
        : parseFloat((supplierRow?.openingBalance as string) ?? "0");
      // Negative balance = supplier owes us (credit available).
      const availableCredit = Math.max(0, round2(-preBalance));

      // Full PO amount always goes on the supplier's khata (accounts
      // payable) regardless of how much cash went out right now.
      const ledgerEntry = await appendSupplierLedgerEntry(tx, {
        supplierId: body.supplierId,
        type: "purchase",
        amount: subtotal,
        purchaseId: inserted.id,
        description: `Purchase — ${poNumber}`,
        createdByUserId: actorUserId,
        entryDate: purchaseDate,
      });
      void ledgerEntry;

      const remainingDueAfterCash = round2(subtotal - paidNow);
      const creditApplied = round2(Math.min(availableCredit, remainingDueAfterCash));
      if (creditApplied > 0) {
        // Not a new cash payment — just recognizing pre-existing credit
        // against this specific PO. No new ledger entry is created here:
        // the credit's original entry (the return/adjustment) plus this
        // purchase's entry above already net to the correct running
        // balance. This only syncs the PO's own amountPaid to match.
        await tx.update(purchasesTable)
          .set({ amountPaid: sql`${purchasesTable.amountPaid} + ${creditApplied}` })
          .where(eq(purchasesTable.id, inserted.id));
      }

      // Keep the supplier's per-product "Cost Price" (shown on the Supplier
      // detail page) in sync with what we actually just paid them for each
      // item on this PO. If a supplier<->product link already exists,
      // update its cost price; otherwise create one so the link/price shows
      // up automatically without the user having to add it by hand.
      for (const item of items) {
        const [existingLink] = await tx
          .select({ id: supplierProductsTable.id })
          .from(supplierProductsTable)
          .where(and(eq(supplierProductsTable.supplierId, body.supplierId), eq(supplierProductsTable.productId, item.productId)));

        if (existingLink) {
          await tx.update(supplierProductsTable)
            .set({ costPrice: String(item.unitCost) })
            .where(eq(supplierProductsTable.id, existingLink.id));
        } else {
          await tx.insert(supplierProductsTable).values({
            supplierId: body.supplierId,
            productId: item.productId,
            costPrice: String(item.unitCost),
            isPreferred: false,
          });
        }
      }

      if (paidNow > 0) {
        const [supplier] = await tx.select().from(suppliersTable).where(eq(suppliersTable.id, body.supplierId));
        const [insertedPayment] = await tx.insert(supplierPaymentsTable).values({
          supplierId: body.supplierId,
          amount: String(paidNow),
          method: paymentMethod,
          reference: `Purchase ${poNumber}`,
          notes: "Paid at time of purchase",
          paidByUserId: actorUserId,
          paymentDate: purchaseDate,
        }).returning();

        await appendSupplierLedgerEntry(tx, {
          supplierId: body.supplierId,
          type: "payment",
          amount: -paidNow,
          purchaseId: inserted.id,
          paymentId: insertedPayment.id,
          description: `Payment made with Purchase ${poNumber}`,
          createdByUserId: actorUserId,
          entryDate: purchaseDate,
        });

        await appendGeneralLedgerEntry(tx, {
          date: purchaseDate,
          type: "supplier_payment",
          referenceId: insertedPayment.id,
          partyType: "supplier",
          partyId: body.supplierId,
          partyName: supplier?.name ?? body.supplierName,
          amount: paidNow,
          direction: "debit",
          note: `Payment with Purchase ${poNumber}`,
          createdByUserId: actorUserId,
        });
      }
    } else {
      // No supplier on record — always immediate cash, goes straight to
      // the cash-in-hand ledger.
      await appendGeneralLedgerEntry(tx, {
        date: purchaseDate,
        type: "purchase",
        referenceId: inserted.id,
        partyType: "none",
        partyId: null,
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

export async function updatePurchase(id: number, body: any, actorUserId: number | null) {
  const [existingPurchase] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, id));
  if (!existingPurchase) throw new Error("Purchase not found");

  if (existingPurchase.purchaseDate && await isDateInClosedPeriod(new Date(existingPurchase.purchaseDate))) {
    throw new MonthClosedError(new Date(existingPurchase.purchaseDate));
  }

  const updateData: Record<string, unknown> = {};
  if (body.status !== undefined) updateData.status = body.status;
  if (body.notes !== undefined) updateData.notes = body.notes;

  if (
    body.status !== undefined &&
    body.status !== existingPurchase.status &&
    existingPurchase.status === "received" &&
    body.status !== "received" &&
    round2(parseFloat((existingPurchase.amountPaid as string) ?? "0")) > 0
  ) {
    throw new Error(
      `Cannot change status of Purchase ${existingPurchase.poNumber}: it has ${parseFloat(existingPurchase.amountPaid as string)} already paid against it. Void the linked payment(s) first so cash-in-hand stays accurate.`,
    );
  }

  if (body.status !== undefined && body.status !== existingPurchase.status) {
    const items = existingPurchase.items as Array<any>;
    if (existingPurchase.status === "received" && body.status !== "received") {
      for (const item of items) {
        const [product] = await db.select({ currentStock: productsTable.currentStock, costPrice: productsTable.costPrice }).from(productsTable).where(eq(productsTable.id, item.productId));
        if (!product) continue;
        const nextAverageCost = calculateWeightedAverageCostAfterChange({
          currentStock: Number(product.currentStock ?? 0),
          averageCost: Number(product.costPrice ?? 0),
          quantityDelta: -Number(item.quantity ?? 0),
          unitCost: Number(item.unitCost ?? 0),
        });
        await db.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} - ${item.quantity}`, costPrice: String(nextAverageCost) }).where(eq(productsTable.id, item.productId));
      }
    } else if (existingPurchase.status !== "received" && body.status === "received") {
      for (const item of items) {
        const [product] = await db.select({ currentStock: productsTable.currentStock, costPrice: productsTable.costPrice }).from(productsTable).where(eq(productsTable.id, item.productId));
        if (!product) continue;
        const nextAverageCost = calculateWeightedAverageCost({
          currentStock: Number(product.currentStock ?? 0),
          averageCost: Number(product.costPrice ?? 0),
          quantity: Number(item.quantity ?? 0),
          unitCost: Number(item.unitCost ?? 0),
        });
        await db.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} + ${item.quantity}`, costPrice: String(nextAverageCost) }).where(eq(productsTable.id, item.productId));
      }
    }
  }

  const [purchase] = await db.update(purchasesTable).set(updateData).where(eq(purchasesTable.id, id)).returning();
  return purchase;
}

export async function deletePurchase(id: number, actorUserId: number | null) {
  const [existingPurchase] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, id));
  if (!existingPurchase) throw new Error("Purchase not found");

  if (existingPurchase.purchaseDate && await isDateInClosedPeriod(new Date(existingPurchase.purchaseDate))) {
    throw new MonthClosedError(new Date(existingPurchase.purchaseDate));
  }

  if (existingPurchase.status === "received") {
    const items = existingPurchase.items as Array<any>;
    for (const item of items) {
      const [product] = await db.select({ currentStock: productsTable.currentStock, costPrice: productsTable.costPrice }).from(productsTable).where(eq(productsTable.id, item.productId));
      if (!product) continue;
      const nextAverageCost = calculateWeightedAverageCostAfterChange({
        currentStock: Number(product.currentStock ?? 0),
        averageCost: Number(product.costPrice ?? 0),
        quantityDelta: -Number(item.quantity ?? 0),
        unitCost: Number(item.unitCost ?? 0),
      });
      await db.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} - ${item.quantity}`, costPrice: String(nextAverageCost) }).where(eq(productsTable.id, item.productId));
    }
  }

  await db.delete(purchasesTable).where(eq(purchasesTable.id, id));
}

export default { listPurchases, createPurchase, updatePurchase, deletePurchase };
