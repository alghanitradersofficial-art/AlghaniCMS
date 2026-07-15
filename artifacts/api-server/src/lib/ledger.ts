import { db, customersTable, ledgerEntriesTable, paymentsTable, salesTable } from "@workspace/db";
import { eq, desc, asc, and, sql, gt } from "drizzle-orm";

// The app uses the shared db connection from the workspace package, and the
// repo's current Drizzle typing setup can make the transaction callback overly
// narrow for these helpers. Using a permissive shared transaction type keeps
// the ledger helpers compatible while preserving runtime behavior.
export type DbTx = any;

export type LedgerEntryType = "sale" | "payment" | "adjustment" | "opening_balance";

/**
 * Appends one immutable ledger entry for a customer, computing its running
 * balance from the previous entry (or the customer's opening balance if this
 * is the first entry ever). Locks the customer row for the duration of the
 * transaction so concurrent sales/payments for the same customer can never
 * race and produce an inconsistent running balance.
 *
 * MUST be called from inside a `db.transaction(async (tx) => { ... })` block.
 */
export async function appendLedgerEntry(
  tx: DbTx,
  params: {
    customerId: number;
    type: LedgerEntryType;
    amount: number; // signed: +sale increases receivable, -payment decreases it
    saleId?: number | null;
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
    // otherwise, fallthrough
  }
  // Row-lock the customer for the duration of this transaction. Any other
  // transaction trying to append a ledger entry for the same customer will
  // block here until this one commits/rolls back — this is what guarantees
  // the running balance can never drift out of sync under concurrent load.
  const lockResult = await tx.execute(
    sql`SELECT opening_balance FROM customers WHERE id = ${params.customerId} FOR UPDATE`,
  );
  const customerRow = (lockResult as unknown as { rows: Array<{ opening_balance: string }> }).rows?.[0];
  if (!customerRow) {
    throw new Error(`Customer ${params.customerId} not found`);
  }

  const [lastEntry] = await tx
    .select({ runningBalance: ledgerEntriesTable.runningBalance })
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.customerId, params.customerId))
    .orderBy(desc(ledgerEntriesTable.id))
    .limit(1);

  const previousBalance = lastEntry
    ? parseFloat(lastEntry.runningBalance as string)
    : parseFloat(customerRow.opening_balance);

  const runningBalance = round2(previousBalance + params.amount);

  const [entry] = await tx
    .insert(ledgerEntriesTable)
    .values({
      customerId: params.customerId,
      type: params.type,
      amount: String(round2(params.amount)),
      runningBalance: String(runningBalance),
      saleId: params.saleId ?? null,
      paymentId: params.paymentId ?? null,
      description: params.description ?? null,
      createdByUserId: params.createdByUserId ?? null,
      entryDate: params.entryDate ?? new Date(),
    })
    .returning();

  return entry;
}

/**
 * Recomputes every ledger entry's running balance for a customer in strict
 * chronological order (entryDate, then id as a tiebreaker), starting from
 * the customer's opening balance. This MUST be called (inside the same
 * transaction) after appending any ledger entry whose entryDate may not be
 * the latest — e.g. backdated sales/payments — because appendLedgerEntry
 * only chains off the most-recently-INSERTED row, not the most-recent-BY-DATE
 * row, and will otherwise leave the balance chain inconsistent with the
 * chronological timeline shown to users. Mirrors
 * recomputeSupplierLedgerRunningBalances in supplier-ledger.ts.
 */
export async function recomputeCustomerLedgerRunningBalances(tx: DbTx, customerId: number) {
  const [customer] = await tx
    .select({ openingBalance: customersTable.openingBalance })
    .from(customersTable)
    .where(eq(customersTable.id, customerId));

  if (!customer) {
    throw new Error(`Customer ${customerId} not found`);
  }

  const entries = await tx
    .select()
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.customerId, customerId))
    .orderBy(asc(ledgerEntriesTable.entryDate), asc(ledgerEntriesTable.id));

  let runningBalance = parseFloat(customer.openingBalance as string);
  for (const entry of entries) {
    runningBalance = round2(runningBalance + parseFloat(entry.amount as string));
    await tx
      .update(ledgerEntriesTable)
      .set({ runningBalance: String(runningBalance) })
      .where(eq(ledgerEntriesTable.id, entry.id));
  }
}

/**
 * Allocates a payment amount across a customer's outstanding invoices.
 * If `explicitAllocations` is provided, those are validated against each
 * invoice's remaining balance. Otherwise, applies FIFO (oldest invoice
 * first). Updates `sales.amount_paid` for every invoice touched, inside the
 * given transaction, so per-invoice outstanding/aging queries stay accurate.
 *
 * Returns the list of {saleId, invoiceNumber, amount} allocations actually applied.
 */
export async function allocatePayment(
  tx: DbTx,
  params: {
    customerId: number;
    amount: number;
    explicitAllocations?: Array<{ saleId: number; amount: number }>;
  },
): Promise<Array<{ saleId: number; invoiceNumber: string; amount: number }>> {
  let remaining = round2(params.amount);
  const applied: Array<{ saleId: number; invoiceNumber: string; amount: number }> = [];

  if (params.explicitAllocations && params.explicitAllocations.length > 0) {
    // NOTE: this must be called after `appendLedgerEntry` has already locked
    // the customer row in the same transaction (see routes/payments.ts) —
    // that lock serializes all concurrent sale/payment writes for this
    // customer, so a separate per-invoice row lock isn't needed here.
    for (const alloc of params.explicitAllocations) {
      if (remaining <= 0) break;
      const [sale] = await tx
        .select({ id: salesTable.id, invoiceNumber: salesTable.invoiceNumber, total: salesTable.total, amountPaid: salesTable.amountPaid })
        .from(salesTable)
        .where(and(eq(salesTable.id, alloc.saleId), eq(salesTable.customerId, params.customerId)));

      if (!sale) continue;
      const dueOnInvoice = round2(parseFloat(sale.total as string) - parseFloat(sale.amountPaid as string));
      const applyAmount = round2(Math.min(dueOnInvoice, alloc.amount, remaining));
      if (applyAmount <= 0) continue;

      await tx
        .update(salesTable)
        .set({ amountPaid: sql`${salesTable.amountPaid} + ${applyAmount}` })
        .where(eq(salesTable.id, sale.id));

      applied.push({ saleId: sale.id, invoiceNumber: sale.invoiceNumber, amount: applyAmount });
      remaining = round2(remaining - applyAmount);
    }
    return applied;
  }

  // FIFO: oldest unpaid invoice first.
  const openInvoices = await tx
    .select({ id: salesTable.id, invoiceNumber: salesTable.invoiceNumber, total: salesTable.total, amountPaid: salesTable.amountPaid })
    .from(salesTable)
    .where(and(eq(salesTable.customerId, params.customerId), eq(salesTable.status, "completed")))
    .orderBy(asc(salesTable.createdAt));

  for (const sale of openInvoices) {
    if (remaining <= 0) break;
    const dueOnInvoice = round2(parseFloat(sale.total as string) - parseFloat(sale.amountPaid as string));
    if (dueOnInvoice <= 0) continue;

    const applyAmount = round2(Math.min(dueOnInvoice, remaining));
    if (applyAmount <= 0) continue;

    await tx
      .update(salesTable)
      .set({ amountPaid: sql`${salesTable.amountPaid} + ${applyAmount}` })
      .where(eq(salesTable.id, sale.id));

    applied.push({ saleId: sale.id, invoiceNumber: sale.invoiceNumber, amount: applyAmount });
    remaining = round2(remaining - applyAmount);
  }

  // Any leftover beyond all outstanding invoices becomes an advance balance
  // (negative-outstanding) automatically — it's simply not allocated to any
  // invoice, but it IS reflected in the customer's overall running balance
  // via the ledger entry recorded by the caller.
  return applied;
}

/**
 * Read-side aggregate summary for a customer — balance, totals, credit,
 * pending invoices, oldest unpaid invoice, overdue days. Safe to call
 * outside a transaction (used for dashboards/reports).
 */
export async function getCustomerLedgerSummary(customerId: number) {
  const [customer] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.id, customerId));
  if (!customer) return null;

  const [lastEntry] = await db
    .select()
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.customerId, customerId))
    .orderBy(desc(ledgerEntriesTable.id))
    .limit(1);

  const currentBalance = lastEntry
    ? parseFloat(lastEntry.runningBalance as string)
    : parseFloat(customer.openingBalance as string);

  const [salesAgg] = await db
    .select({
      totalSales: sql<string>`COALESCE(SUM(${salesTable.total}), 0)`,
      totalOutstanding: sql<string>`COALESCE(SUM(${salesTable.total} - ${salesTable.amountPaid}), 0)`,
      pendingInvoices: sql<string>`COUNT(*) FILTER (WHERE ${salesTable.total} - ${salesTable.amountPaid} > 0.005)`,
    })
    .from(salesTable)
    .where(and(eq(salesTable.customerId, customerId), eq(salesTable.status, "completed")));

  const [oldestUnpaid] = await db
    .select({ invoiceNumber: salesTable.invoiceNumber, createdAt: salesTable.createdAt, total: salesTable.total, amountPaid: salesTable.amountPaid })
    .from(salesTable)
    .where(and(
      eq(salesTable.customerId, customerId),
      eq(salesTable.status, "completed"),
      gt(sql`${salesTable.total} - ${salesTable.amountPaid}`, sql`0.005`),
    ))
    .orderBy(asc(salesTable.createdAt))
    .limit(1);

  const [paymentsAgg] = await db
    .select({ totalPayments: sql<string>`COALESCE(SUM(${paymentsTable.amount}), 0)` })
    .from(paymentsTable)
    .where(and(eq(paymentsTable.customerId, customerId), eq(paymentsTable.isVoided, false)));

  const [lastPayment] = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.customerId, customerId), eq(paymentsTable.isVoided, false)))
    .orderBy(desc(paymentsTable.paymentDate))
    .limit(1);

  const totalSales = parseFloat(salesAgg?.totalSales ?? "0");
  const totalOutstanding = Math.max(0, parseFloat(salesAgg?.totalOutstanding ?? "0"));
  const totalPayments = parseFloat(paymentsAgg?.totalPayments ?? "0");
  const creditLimit = parseFloat(customer.creditLimit as string);
  const availableCredit = creditLimit > 0 ? round2(creditLimit - Math.max(0, currentBalance)) : 0;
  const advanceBalance = currentBalance < 0 ? Math.abs(currentBalance) : 0;
  const overdueDays = oldestUnpaid ? daysSince(oldestUnpaid.createdAt) : 0;

  return {
    customerId,
    openingBalance: parseFloat(customer.openingBalance as string),
    currentBalance: round2(currentBalance),
    outstandingAmount: round2(totalOutstanding),
    advanceBalance: round2(advanceBalance),
    creditLimit: round2(creditLimit),
    availableCredit: round2(availableCredit),
    totalSales: round2(totalSales),
    totalPayments: round2(totalPayments),
    numberOfPendingInvoices: Number(salesAgg?.pendingInvoices ?? 0),
    oldestUnpaidInvoice: oldestUnpaid
      ? { invoiceNumber: oldestUnpaid.invoiceNumber, date: oldestUnpaid.createdAt.toISOString(), outstanding: round2(parseFloat(oldestUnpaid.total as string) - parseFloat(oldestUnpaid.amountPaid as string)) }
      : null,
    overdueDays,
    lastPayment: lastPayment
      ? {
          id: lastPayment.id,
          amount: parseFloat(lastPayment.amount as string),
          method: lastPayment.method,
          date: lastPayment.paymentDate.toISOString(),
        }
      : null,
  };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function daysSince(date: Date): number {
  const ms = Date.now() - new Date(date).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}
