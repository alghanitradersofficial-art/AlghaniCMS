import { db } from "@workspace/db";
import { and, eq, gte, lte, sql, desc, or, ilike } from "drizzle-orm";
import {
  paymentsTable,
  supplierPaymentsTable,
  expensesTable,
  cashLedgerEntriesTable,
  customersTable,
  suppliersTable,
} from "@workspace/db/schema";
import { isDateInClosedPeriod, MonthClosedError } from "./months.service.js";

function toNumber(value: unknown): number {
  const n = typeof value === "string" ? Number.parseFloat(value) : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export type CashMovement = {
  id: string; // prefixed with source, e.g. "payment:12"
  date: string; // ISO
  source: "customer_payment" | "supplier_payment" | "expense" | "manual";
  direction: "in" | "out";
  amount: number;
  partyName: string | null;
  description: string;
  createdByUserId: number | null;
};

/**
 * Pulls every cash-relevant movement in [start, end] from the source tables
 * (not the general_ledger_entries feed — that one doesn't record payment
 * method, so it can't distinguish cash from bank/cheque/mobile-wallet
 * transfers). Only method='cash' rows count toward cash-in-hand; voided
 * payments are excluded.
 */
export async function listCashMovements(start: Date | null, end: Date | null, search?: string): Promise<CashMovement[]> {
  if (!db) return [];

  const dateFilterPayments = (col: any) => {
    const parts = [] as any[];
    if (start) parts.push(gte(col, start));
    if (end) parts.push(lte(col, end));
    return parts;
  };

  const searchTerm = search?.trim();

  const [customerPayments, supplierPayments, expenseRows, manualEntries] = await Promise.all([
    db
      .select({
        id: paymentsTable.id,
        date: paymentsTable.paymentDate,
        amount: paymentsTable.amount,
        notes: paymentsTable.notes,
        reference: paymentsTable.reference,
        createdByUserId: paymentsTable.receivedByUserId,
        partyName: customersTable.name,
      })
      .from(paymentsTable)
      .leftJoin(customersTable, eq(customersTable.id, paymentsTable.customerId))
      .where(
        and(
          eq(paymentsTable.method, "cash"),
          eq(paymentsTable.isVoided, false),
          ...dateFilterPayments(paymentsTable.paymentDate),
          searchTerm
            ? or(ilike(customersTable.name, `%${searchTerm}%`), ilike(paymentsTable.notes, `%${searchTerm}%`), ilike(paymentsTable.reference, `%${searchTerm}%`))
            : undefined,
        ),
      ),
    db
      .select({
        id: supplierPaymentsTable.id,
        date: supplierPaymentsTable.paymentDate,
        amount: supplierPaymentsTable.amount,
        notes: supplierPaymentsTable.notes,
        reference: supplierPaymentsTable.reference,
        createdByUserId: supplierPaymentsTable.paidByUserId,
        partyName: suppliersTable.name,
      })
      .from(supplierPaymentsTable)
      .leftJoin(suppliersTable, eq(suppliersTable.id, supplierPaymentsTable.supplierId))
      .where(
        and(
          eq(supplierPaymentsTable.method, "cash"),
          eq(supplierPaymentsTable.isVoided, false),
          ...dateFilterPayments(supplierPaymentsTable.paymentDate),
          searchTerm
            ? or(ilike(suppliersTable.name, `%${searchTerm}%`), ilike(supplierPaymentsTable.notes, `%${searchTerm}%`), ilike(supplierPaymentsTable.reference, `%${searchTerm}%`))
            : undefined,
        ),
      ),
    db
      .select({
        id: expensesTable.id,
        date: expensesTable.date,
        amount: expensesTable.amount,
        title: expensesTable.title,
        category: expensesTable.category,
        notes: expensesTable.notes,
        createdByUserId: expensesTable.createdByUserId,
      })
      .from(expensesTable)
      .where(
        and(
          start ? sql`${expensesTable.date}::date >= ${start.toISOString().slice(0, 10)}::date` : undefined,
          end ? sql`${expensesTable.date}::date <= ${end.toISOString().slice(0, 10)}::date` : undefined,
          searchTerm ? or(ilike(expensesTable.title, `%${searchTerm}%`), ilike(expensesTable.category, `%${searchTerm}%`), ilike(expensesTable.notes, `%${searchTerm}%`)) : undefined,
        ),
      ),
    db
      .select()
      .from(cashLedgerEntriesTable)
      .where(
        and(
          ...dateFilterPayments(cashLedgerEntriesTable.entryDate),
          searchTerm ? ilike(cashLedgerEntriesTable.note, `%${searchTerm}%`) : undefined,
        ),
      ),
  ]);

  const movements: CashMovement[] = [];

  for (const p of customerPayments) {
    movements.push({
      id: `payment:${p.id}`,
      date: new Date(p.date).toISOString(),
      source: "customer_payment",
      direction: "in",
      amount: toNumber(p.amount),
      partyName: p.partyName ?? null,
      description: p.notes || p.reference || "Customer cash payment",
      createdByUserId: p.createdByUserId ?? null,
    });
  }

  for (const p of supplierPayments) {
    movements.push({
      id: `supplier_payment:${p.id}`,
      date: new Date(p.date).toISOString(),
      source: "supplier_payment",
      direction: "out",
      amount: toNumber(p.amount),
      partyName: p.partyName ?? null,
      description: p.notes || p.reference || "Supplier cash payment",
      createdByUserId: p.createdByUserId ?? null,
    });
  }

  for (const e of expenseRows) {
    movements.push({
      id: `expense:${e.id}`,
      date: new Date(e.date).toISOString(),
      source: "expense",
      direction: "out",
      amount: toNumber(e.amount),
      partyName: null,
      description: e.notes || `${e.category}: ${e.title}`,
      createdByUserId: e.createdByUserId ?? null,
    });
  }

  for (const m of manualEntries) {
    movements.push({
      id: `manual:${m.id}`,
      date: new Date(m.entryDate).toISOString(),
      source: "manual",
      direction: m.direction === "out" ? "out" : "in",
      amount: toNumber(m.amount),
      partyName: null,
      description: m.note || (m.type === "opening_balance" ? "Opening balance" : "Manual cash entry"),
      createdByUserId: m.createdByUserId ?? null,
    });
  }

  movements.sort((a, b) => a.date.localeCompare(b.date));
  return movements;
}

function bucketKey(date: Date, bucket: "daily" | "weekly" | "monthly"): string {
  if (bucket === "monthly") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  if (bucket === "weekly") {
    // ISO-ish week start (Sunday) key, using the week's start date.
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    return start.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

/**
 * The cash-in-hand balance carried in from before `start` — i.e. every
 * manual/cash movement that happened strictly before the report window,
 * so the running balance inside the window starts from the true
 * historical total rather than Rs. 0. This is what "old data entry"
 * (opening_balance / old_entry rows) exists to seed.
 */
export async function getOpeningCashBalance(start: Date | null): Promise<number> {
  if (!start) return 0;
  const movements = await listCashMovements(null, new Date(start.getTime() - 1));
  return movements.reduce((sum, m) => sum + (m.direction === "in" ? m.amount : -m.amount), 0);
}

export type CashReportBucketRow = {
  bucket: string;
  cashIn: number;
  cashOut: number;
  netChange: number;
  closingBalance: number;
  transactionCount: number;
};

export async function getCashReport(start: Date | null, end: Date | null, bucketSize: "daily" | "weekly" | "monthly") {
  const [movements, openingBalance] = await Promise.all([
    listCashMovements(start, end),
    getOpeningCashBalance(start),
  ]);

  const buckets = new Map<string, CashReportBucketRow>();
  for (const m of movements) {
    const key = bucketKey(new Date(m.date), bucketSize);
    if (!buckets.has(key)) {
      buckets.set(key, { bucket: key, cashIn: 0, cashOut: 0, netChange: 0, closingBalance: 0, transactionCount: 0 });
    }
    const row = buckets.get(key)!;
    row.transactionCount += 1;
    if (m.direction === "in") row.cashIn += m.amount;
    else row.cashOut += m.amount;
  }

  const sortedBuckets = Array.from(buckets.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
  let running = openingBalance;
  for (const row of sortedBuckets) {
    row.netChange = row.cashIn - row.cashOut;
    running += row.netChange;
    row.closingBalance = running;
  }

  const totalIn = movements.reduce((s, m) => s + (m.direction === "in" ? m.amount : 0), 0);
  const totalOut = movements.reduce((s, m) => s + (m.direction === "out" ? m.amount : 0), 0);

  return {
    openingBalance,
    closingBalance: openingBalance + totalIn - totalOut,
    totalIn,
    totalOut,
    netChange: totalIn - totalOut,
    transactionCount: movements.length,
    buckets: sortedBuckets,
  };
}

export async function searchCashHistory(params: { search?: string; start: Date | null; end: Date | null }) {
  const movements = await listCashMovements(params.start, params.end, params.search);
  // Return newest-first for a history/search view.
  return [...movements].reverse();
}

export async function addManualCashEntry(params: {
  entryDate: Date;
  type: "opening_balance" | "old_entry" | "adjustment";
  direction: "in" | "out";
  amount: number;
  note?: string | null;
  actorUserId: number | null;
}) {
  if (!db) throw new Error("Database unavailable");
  // Old/manual cash entries are financial records like any other — once the
  // month they fall in has been closed, they can't be backdated into it.
  // This keeps the Cash in Hand report consistent with the closed month's
  // locked snapshot instead of silently changing history after a close.
  if (await isDateInClosedPeriod(params.entryDate)) {
    throw new MonthClosedError(params.entryDate);
  }
  const [row] = await db
    .insert(cashLedgerEntriesTable)
    .values({
      entryDate: params.entryDate,
      type: params.type,
      direction: params.direction,
      amount: String(Math.abs(params.amount)),
      note: params.note ?? null,
      createdByUserId: params.actorUserId,
    })
    .returning();
  return row;
}

export async function deleteManualCashEntry(id: number) {
  if (!db) throw new Error("Database unavailable");
  const [existing] = await db.select().from(cashLedgerEntriesTable).where(eq(cashLedgerEntriesTable.id, id));
  if (!existing) throw new Error("Entry not found");
  if (await isDateInClosedPeriod(new Date(existing.entryDate))) {
    throw new MonthClosedError(new Date(existing.entryDate));
  }
  await db.delete(cashLedgerEntriesTable).where(eq(cashLedgerEntriesTable.id, id));
  return { ok: true };
}

export default {
  listCashMovements,
  getCashReport,
  getOpeningCashBalance,
  searchCashHistory,
  addManualCashEntry,
  deleteManualCashEntry,
};
