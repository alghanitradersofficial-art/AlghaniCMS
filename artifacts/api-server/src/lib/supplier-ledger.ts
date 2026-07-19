import { db, suppliersTable, supplierLedgerEntriesTable, purchasesTable, supplierPaymentsTable } from "@workspace/db";
import { eq, desc, asc, and, sql } from "drizzle-orm";
import type { DbTx } from "./ledger.js";
import { round2 } from "./ledger.js";

export type SupplierLedgerEntryType =
  | "purchase"
  | "payment"
  | "return"
  | "adjustment"
  | "opening_balance";

/**
 * Appends one immutable ledger entry for a supplier, computing its running
 * balance from the previous entry (or the supplier's opening balance if
 * this is the first entry). Row-locks the supplier record for the
 * transaction to serialize concurrent writes. Mirrors appendLedgerEntry in
 * lib/ledger.ts.
 *
 * Sign convention: positive amount increases what we owe the supplier (a
 * purchase); negative decreases it (a payment we made, or a return/credit
 * in our favor).
 *
 * MUST be called from inside a `db.transaction(async (tx) => { ... })` block.
 */
export async function appendSupplierLedgerEntry(
  tx: DbTx,
  params: {
    supplierId: number;
    type: SupplierLedgerEntryType;
    amount: number;
    purchaseId?: number | null;
    paymentId?: number | null;
    description?: string | null;
    createdByUserId?: number | null;
    entryDate?: Date;
  },
) {
  // prevent writes into closed financial periods
  try {
    const months = await import("../services/months.service.js");
    const entryDate = params.entryDate ?? new Date();
    if (await months.isDateInClosedPeriod(entryDate)) {
      throw new months.MonthClosedError(entryDate);
    }
  } catch (err) {
    if (err && (err as Error).name === "MonthClosedError") throw err;
    // otherwise fallthrough
  }
  const lockResult = await tx.execute(
    sql`SELECT opening_balance FROM suppliers WHERE id = ${params.supplierId} FOR UPDATE`,
  );
  const supplierRow = (lockResult as unknown as { rows: Array<{ opening_balance: string }> }).rows?.[0];
  if (!supplierRow) {
    throw new Error(`Supplier ${params.supplierId} not found`);
  }

  const [lastEntry] = await tx
    .select({ runningBalance: supplierLedgerEntriesTable.runningBalance })
    .from(supplierLedgerEntriesTable)
    .where(eq(supplierLedgerEntriesTable.supplierId, params.supplierId))
    .orderBy(desc(supplierLedgerEntriesTable.id))
    .limit(1);

  const previousBalance = lastEntry
    ? parseFloat(lastEntry.runningBalance as string)
    : parseFloat(supplierRow.opening_balance);

  const runningBalance = round2(previousBalance + params.amount);

  const [entry] = await tx
    .insert(supplierLedgerEntriesTable)
    .values({
      supplierId: params.supplierId,
      type: params.type,
      amount: String(round2(params.amount)),
      runningBalance: String(runningBalance),
      purchaseId: params.purchaseId ?? null,
      paymentId: params.paymentId ?? null,
      description: params.description ?? null,
      createdByUserId: params.createdByUserId ?? null,
      entryDate: params.entryDate ?? new Date(),
    })
    .returning();

  return entry;
}

/**
 * Allocates a payment amount across a supplier's outstanding purchase
 * orders, FIFO (oldest first) unless explicit allocations are given.
 * Updates purchases.amount_paid for every PO touched. Mirrors
 * allocatePayment in lib/ledger.ts.
 */
export async function allocateSupplierPayment(
  tx: DbTx,
  params: {
    supplierId: number;
    amount: number;
    explicitAllocations?: Array<{ purchaseId: number; amount: number }>;
  },
): Promise<Array<{ purchaseId: number; poNumber: string; amount: number }>> {
  let remaining = round2(params.amount);
  const applied: Array<{ purchaseId: number; poNumber: string; amount: number }> = [];

  if (params.explicitAllocations && params.explicitAllocations.length > 0) {
    for (const alloc of params.explicitAllocations) {
      if (remaining <= 0) break;
      const [purchase] = await tx
        .select({ id: purchasesTable.id, poNumber: purchasesTable.poNumber, total: purchasesTable.total, amountPaid: purchasesTable.amountPaid })
        .from(purchasesTable)
        .where(and(eq(purchasesTable.id, alloc.purchaseId), eq(purchasesTable.supplierId, params.supplierId)));

      if (!purchase) continue;
      const dueOnPo = round2(parseFloat(purchase.total as string) - parseFloat(purchase.amountPaid as string));
      const applyAmount = round2(Math.min(dueOnPo, alloc.amount, remaining));
      if (applyAmount <= 0) continue;

      await tx
        .update(purchasesTable)
        .set({ amountPaid: sql`${purchasesTable.amountPaid} + ${applyAmount}` })
        .where(eq(purchasesTable.id, purchase.id));

      applied.push({ purchaseId: purchase.id, poNumber: purchase.poNumber, amount: applyAmount });
      remaining = round2(remaining - applyAmount);
    }
    return applied;
  }

  const openPOs = await tx
    .select({ id: purchasesTable.id, poNumber: purchasesTable.poNumber, total: purchasesTable.total, amountPaid: purchasesTable.amountPaid })
    .from(purchasesTable)
    .where(and(eq(purchasesTable.supplierId, params.supplierId), eq(purchasesTable.status, "received")))
    .orderBy(asc(purchasesTable.createdAt));

  for (const po of openPOs) {
    if (remaining <= 0) break;
    const dueOnPo = round2(parseFloat(po.total as string) - parseFloat(po.amountPaid as string));
    if (dueOnPo <= 0) continue;

    const applyAmount = round2(Math.min(dueOnPo, remaining));
    if (applyAmount <= 0) continue;

    // Ensure we are not updating a purchase in a closed financial period
    const [purchaseRow] = await tx.select().from(purchasesTable).where(eq(purchasesTable.id, po.id));
    try {
      const months = await import("../services/months.service.js");
      if (purchaseRow && await months.isDateInClosedPeriod(purchaseRow.purchaseDate)) {
        throw new months.MonthClosedError(purchaseRow.purchaseDate);
      }
    } catch (err) {
      if (err && (err as Error).name === "MonthClosedError") throw err;
    }

    await tx
      .update(purchasesTable)
      .set({ amountPaid: sql`${purchasesTable.amountPaid} + ${applyAmount}` })
      .where(eq(purchasesTable.id, po.id));

    applied.push({ purchaseId: po.id, poNumber: po.poNumber, amount: applyAmount });
    remaining = round2(remaining - applyAmount);
  }

  return applied;
}

/**
 * Fixes an already-existing mismatch between a supplier's true ledger
 * balance ("We Owe") and the sum of (total - amountPaid) across their
 * "received" POs ("Outstanding") — e.g. a claim/return credit that was
 * posted to the ledger before a later PO existed to apply it against.
 * Distributes the gap across open POs, oldest first, purely as an
 * amountPaid correction. Creates NO new ledger entries, since the ledger
 * balance is already correct — this only re-syncs the per-PO figure.
 * Safe to call repeatedly; it's a no-op once the two numbers agree.
 */
export async function reconcileSupplierOutstanding(supplierId: number) {
  const summary = await getSupplierLedgerSummary(supplierId);
  if (!summary) throw new Error(`Supplier ${supplierId} not found`);

  // Never owe less than Rs 0 — if we're net in credit, nothing is due.
  const trueOwed = Math.max(0, summary.currentBalance);
  const gap = round2(summary.outstandingAmount - trueOwed);
  if (gap <= 0) return { adjusted: [] as Array<{ purchaseId: number; poNumber: string; amount: number }>, gap: 0 };

  return db.transaction(async (tx) => {
    const applied = await allocateSupplierPayment(tx, { supplierId, amount: gap });
    return { adjusted: applied, gap };
  });
}

export async function recomputeSupplierLedgerRunningBalances(tx: DbTx, supplierId: number) {
  const [supplier] = await tx
    .select({ openingBalance: suppliersTable.openingBalance })
    .from(suppliersTable)
    .where(eq(suppliersTable.id, supplierId));

  if (!supplier) {
    throw new Error(`Supplier ${supplierId} not found`);
  }

  const entries = await tx
    .select()
    .from(supplierLedgerEntriesTable)
    .where(eq(supplierLedgerEntriesTable.supplierId, supplierId))
    .orderBy(asc(supplierLedgerEntriesTable.entryDate), asc(supplierLedgerEntriesTable.id));

  let runningBalance = parseFloat(supplier.openingBalance as string);
  for (const entry of entries) {
    runningBalance = round2(runningBalance + parseFloat(entry.amount as string));
    await tx
      .update(supplierLedgerEntriesTable)
      .set({ runningBalance: String(runningBalance) })
      .where(eq(supplierLedgerEntriesTable.id, entry.id));
  }
}

/**
 * Read-side summary for a supplier's ledger — balance + totals. Safe to
 * call outside a transaction.
 */
export async function getSupplierLedgerSummary(supplierId: number) {
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));
  if (!supplier) return null;

  const [lastEntry] = await db
    .select()
    .from(supplierLedgerEntriesTable)
    .where(eq(supplierLedgerEntriesTable.supplierId, supplierId))
    .orderBy(desc(supplierLedgerEntriesTable.id))
    .limit(1);

  const currentBalance = lastEntry
    ? parseFloat(lastEntry.runningBalance as string)
    : parseFloat(supplier.openingBalance as string);

  const [purchaseAgg] = await db
    .select({
      totalPurchases: sql<string>`COALESCE(SUM(${purchasesTable.total}), 0)`,
      totalOutstanding: sql<string>`COALESCE(SUM(${purchasesTable.total} - ${purchasesTable.amountPaid}), 0)`,
    })
    .from(purchasesTable)
    .where(and(eq(purchasesTable.supplierId, supplierId), eq(purchasesTable.status, "received")));

  const [paymentsAgg] = await db
    .select({ totalPayments: sql<string>`COALESCE(SUM(${supplierPaymentsTable.amount}), 0)` })
    .from(supplierPaymentsTable)
    .where(and(eq(supplierPaymentsTable.supplierId, supplierId), eq(supplierPaymentsTable.isVoided, false)));

  return {
    supplierId,
    openingBalance: round2(parseFloat(supplier.openingBalance as string)),
    currentBalance: round2(currentBalance), // positive = we owe supplier
    outstandingAmount: round2(Math.max(0, parseFloat(purchaseAgg?.totalOutstanding ?? "0"))),
    totalPurchases: round2(parseFloat(purchaseAgg?.totalPurchases ?? "0")),
    totalPayments: round2(parseFloat(paymentsAgg?.totalPayments ?? "0")),
  };
}
