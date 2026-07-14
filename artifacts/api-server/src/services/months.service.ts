import { db } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { initializeDatabase } from "../lib/init-db.js";
import { logger } from "../lib/logger.js";
import {
  salesTable,
  purchasesTable,
  expensesTable,
  paymentsTable,
  supplierPaymentsTable,
  productsTable,
  auditLogTable,
  monthClosuresTable,
  financialPeriodsTable,
  financialPeriodSnapshotsTable,
  financialPeriodBalancesTable,
  financialPeriodAuditLogsTable,
} from "@workspace/db/schema";

function toNumber(value: unknown): number {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Real Cost of Goods Sold for a date range, computed from the cost price
// recorded against each sold item at sale time (customer_price_history), not
// from that period's purchases. See routes/reports.ts computeCogsForRange
// for the full rationale — this mirrors that logic so month-closing and the
// Reports page always agree on profit.
async function computeCogsForRange(periodStart: Date, periodEnd: Date): Promise<number> {
  if (!db) return 0;
  const result = await db.execute(sql`
    WITH sale_items AS (
      SELECT
        s.id AS sale_id,
        (item->>'productId')::integer AS product_id,
        (item->>'quantity')::numeric AS quantity
      FROM sales s, jsonb_array_elements(s.items) AS item
      WHERE s.status = 'completed' AND s.sale_date >= ${periodStart} AND s.sale_date <= ${periodEnd}
    ),
    priced AS (
      SELECT
        si.quantity,
        COALESCE(
          (SELECT cph.cost_price FROM customer_price_history cph WHERE cph.sale_id = si.sale_id AND cph.product_id = si.product_id LIMIT 1),
          (SELECT p.cost_price FROM products p WHERE p.id = si.product_id),
          0
        ) AS cost_price
      FROM sale_items si
    )
    SELECT COALESCE(SUM(quantity * cost_price), 0) AS total_cogs FROM priced
  `);
  const rows = (result as unknown as { rows: Array<{ total_cogs: string }> }).rows ?? [];
  return toNumber(rows[0]?.total_cogs);
}

function createFallbackSummary() {
  return {
    salesSummary: {
      totalSales: 0,
      cashSales: 0,
      creditSales: 0,
      returnedSales: 0,
      discounts: 0,
      netSales: 0,
    },
    purchaseSummary: {
      totalPurchases: 0,
      purchaseReturns: 0,
      netPurchases: 0,
    },
    profitSummary: {
      grossProfit: 0,
      costOfGoodsSold: 0,
      totalExpenses: 0,
      netProfit: 0,
    },
    inventorySummary: {
      openingStock: 0,
      purchasedStock: 0,
      soldStock: 0,
      adjustments: 0,
      damagedStock: 0,
      closingStock: 0,
      closingStockValue: 0,
    },
    customerSummary: {
      totalCustomerReceivables: 0,
      outstandingCustomers: 0,
      paymentsReceived: 0,
    },
    supplierSummary: {
      totalSupplierPayables: 0,
      paymentsMade: 0,
      outstandingSupplierBalance: 0,
    },
    cashSummary: {
      openingCash: 0,
      cashReceived: 0,
      cashPaid: 0,
      expenses: 0,
      closingCashInHand: 0,
    },
  };
}

async function ensureFinancialTablesReady() {
  if (!db) return;
  await initializeDatabase();
}

export async function computeMonthSummary(periodStart: Date, periodEnd: Date) {
  await ensureFinancialTablesReady();
  if (!db) return createFallbackSummary();
  const [{ total_sales }] = await db.select({ total_sales: sql<number>`coalesce(sum(${salesTable.total}::numeric), 0)` }).from(salesTable).where(sql`${salesTable.saleDate} >= ${periodStart} AND ${salesTable.saleDate} <= ${periodEnd} AND ${salesTable.status} = 'completed'`);
  const [{ total_sales_discount }] = await db.select({ total_sales_discount: sql<number>`coalesce(sum(${salesTable.discount}::numeric), 0)` }).from(salesTable).where(sql`${salesTable.saleDate} >= ${periodStart} AND ${salesTable.saleDate} <= ${periodEnd} AND ${salesTable.status} = 'completed'`);
  const [{ total_purchases }] = await db.select({ total_purchases: sql<number>`coalesce(sum(${purchasesTable.total}::numeric), 0)` }).from(purchasesTable).where(sql`${purchasesTable.purchaseDate} >= ${periodStart} AND ${purchasesTable.purchaseDate} <= ${periodEnd}`);
  const [{ total_expenses }] = await db.select({ total_expenses: sql<number>`coalesce(sum(${expensesTable.amount}::numeric), 0)` }).from(expensesTable).where(sql`${expensesTable.createdAt} >= ${periodStart} AND ${expensesTable.createdAt} <= ${periodEnd}`);
  const [{ cash_received }] = await db.select({ cash_received: sql<number>`coalesce(sum(${paymentsTable.amount}::numeric), 0)` }).from(paymentsTable).where(sql`${paymentsTable.paymentDate} >= ${periodStart} AND ${paymentsTable.paymentDate} <= ${periodEnd}`);
  const [{ supplier_payments }] = await db.select({ supplier_payments: sql<number>`coalesce(sum(${supplierPaymentsTable.amount}::numeric), 0)` }).from(supplierPaymentsTable).where(sql`${supplierPaymentsTable.paymentDate} >= ${periodStart} AND ${supplierPaymentsTable.paymentDate} <= ${periodEnd}`);
  const [{ closing_stock_value }] = await db.select({ closing_stock_value: sql<number>`coalesce(sum(${productsTable.currentStock}::numeric * ${productsTable.costPrice}::numeric), 0)` }).from(productsTable);
  const [{ closing_stock_quantity }] = await db.select({ closing_stock_quantity: sql<number>`coalesce(sum(${productsTable.currentStock}::numeric), 0)` }).from(productsTable);
  const [{ customer_outstanding }] = await db.select({ customer_outstanding: sql<number>`coalesce(sum((${salesTable.total}::numeric - ${salesTable.amountPaid}::numeric)), 0)` }).from(salesTable).where(sql`${salesTable.saleDate} <= ${periodEnd} AND ${salesTable.status} = 'completed'`);
  const [{ supplier_outstanding }] = await db.select({ supplier_outstanding: sql<number>`coalesce(sum((${purchasesTable.total}::numeric - ${purchasesTable.amountPaid}::numeric)), 0)` }).from(purchasesTable).where(sql`${purchasesTable.purchaseDate} <= ${periodEnd}`);
  const costOfGoodsSold = await computeCogsForRange(periodStart, periodEnd);

  const totalSales = toNumber(total_sales);
  const discountValue = toNumber(total_sales_discount);
  const netSales = totalSales - discountValue;
  const netPurchases = toNumber(total_purchases);
  // Gross profit = revenue minus the actual cost of what was sold (COGS),
  // NOT minus this period's purchases — those rarely line up 1:1 with sales.
  const grossProfit = netSales - costOfGoodsSold;
  const totalExpenses = toNumber(total_expenses);
  const netProfit = grossProfit - totalExpenses;

  return {
    salesSummary: {
      totalSales,
      cashSales: totalSales,
      creditSales: 0,
      returnedSales: 0,
      discounts: discountValue,
      netSales,
    },
    purchaseSummary: {
      totalPurchases: netPurchases,
      purchaseReturns: 0,
      netPurchases,
    },
    profitSummary: {
      grossProfit,
      costOfGoodsSold,
      totalExpenses,
      netProfit,
    },
    inventorySummary: {
      openingStock: 0,
      purchasedStock: 0,
      soldStock: 0,
      adjustments: 0,
      damagedStock: 0,
      closingStock: toNumber(closing_stock_quantity),
      closingStockValue: toNumber(closing_stock_value),
    },
    customerSummary: {
      totalCustomerReceivables: toNumber(customer_outstanding),
      outstandingCustomers: 0,
      paymentsReceived: toNumber(cash_received),
    },
    supplierSummary: {
      totalSupplierPayables: toNumber(supplier_outstanding),
      paymentsMade: toNumber(supplier_payments),
      outstandingSupplierBalance: toNumber(supplier_outstanding),
    },
    cashSummary: {
      openingCash: 0,
      cashReceived: toNumber(cash_received),
      cashPaid: toNumber(supplier_payments) + totalExpenses,
      expenses: totalExpenses,
      closingCashInHand: toNumber(cash_received) - (toNumber(supplier_payments) + totalExpenses),
    },
  };
}

/**
 * When a closed month is reopened and edited, its closing balances (cash,
 * stock value, customer/supplier outstanding) may change. Those closing
 * balances were carried forward as the *opening* balances of every month
 * that closed after it. This recomputes `targetYear`/`targetMonth` itself
 * from current transaction data (keeping its existing opening balance —
 * that one is untouched by an edit inside the month), then walks forward
 * through every already-closed period after it, re-deriving each one's
 * opening balance from the period before it and recomputing its own
 * numbers in turn — so the whole chain of closed months stays internally
 * consistent instead of the edit only fixing the one month it happened in
 * and leaving every later month quietly wrong.
 *
 * This does not re-open any period (status is left as-is) — it only
 * refreshes stored numbers and snapshots to match reality, flagging each
 * touched period `updatedAfterClosing` so it's visible in the UI.
 */
export async function recalculateForwardChain(targetYear: number, targetMonth: number, actorUserId: number | null) {
  if (!db) return;

  const [targetPeriod] = await db.select().from(financialPeriodsTable).where(and(eq(financialPeriodsTable.year, targetYear), eq(financialPeriodsTable.month, targetMonth)));
  if (!targetPeriod) return;

  {
    const periodStart = new Date(targetYear, targetMonth - 1, 1);
    const periodEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);
    const summary = await computeMonthSummary(periodStart, periodEnd);
    await db.transaction(async (tx) => {
      await tx.update(financialPeriodsTable).set({
        closingCash: String(summary.cashSummary.closingCashInHand),
        closingStockValue: String(summary.inventorySummary.closingStockValue),
        closingCustomerBalance: String(summary.customerSummary.totalCustomerReceivables),
        closingSupplierBalance: String(summary.supplierSummary.totalSupplierPayables),
        updatedAfterClosing: true,
        updatedAt: new Date(),
      }).where(eq(financialPeriodsTable.id, targetPeriod.id));

      await tx.insert(financialPeriodSnapshotsTable).values({
        periodId: targetPeriod.id,
        summary: { year: targetYear, month: targetMonth, status: targetPeriod.status, recalculated: true, recalculatedAt: new Date().toISOString() },
        salesSummary: summary.salesSummary,
        purchaseSummary: summary.purchaseSummary,
        profitSummary: summary.profitSummary,
        inventorySummary: summary.inventorySummary,
        customerSummary: summary.customerSummary,
        supplierSummary: summary.supplierSummary,
        cashSummary: summary.cashSummary,
        topProducts: [],
        topCustomers: [],
        topSuppliers: [],
        kpiSummary: {
          netProfit: summary.profitSummary.netProfit,
          closingStockValue: summary.inventorySummary.closingStockValue,
          totalCustomerReceivables: summary.customerSummary.totalCustomerReceivables,
          totalSupplierPayables: summary.supplierSummary.totalSupplierPayables,
        },
      });

      await tx.insert(financialPeriodAuditLogsTable).values({
        periodId: targetPeriod.id,
        entityType: "month_closure",
        action: "recalculate",
        oldValue: null,
        newValue: JSON.stringify(summary),
        reason: `Recalculated after edits to ${targetYear}-${targetMonth}`,
        performedByUserId: actorUserId,
        metadata: {},
      });
    });
  }

  let cursor = { year: targetYear, month: targetMonth };
  // Safety cap so a data bug can't turn this into an unbounded loop.
  for (let i = 0; i < 600; i++) {
    const nextDate = new Date(cursor.year, cursor.month - 1, 1);
    nextDate.setMonth(nextDate.getMonth() + 1);
    const nextYear = nextDate.getFullYear();
    const nextMonth = nextDate.getMonth() + 1;

    const [nextPeriod] = await db.select().from(financialPeriodsTable).where(and(eq(financialPeriodsTable.year, nextYear), eq(financialPeriodsTable.month, nextMonth)));
    if (!nextPeriod || nextPeriod.status !== "closed") break; // stop at the first open/non-existent period

    const [prevPeriod] = await db.select().from(financialPeriodsTable).where(and(eq(financialPeriodsTable.year, cursor.year), eq(financialPeriodsTable.month, cursor.month)));
    if (!prevPeriod) break;

    const periodStart = new Date(nextYear, nextMonth - 1, 1);
    const periodEnd = new Date(nextYear, nextMonth, 0, 23, 59, 59, 999);
    const summary = await computeMonthSummary(periodStart, periodEnd);

    await db.transaction(async (tx) => {
      await tx.update(financialPeriodsTable).set({
        openingCash: prevPeriod.closingCash,
        openingStockValue: prevPeriod.closingStockValue,
        openingCustomerBalance: prevPeriod.closingCustomerBalance,
        openingSupplierBalance: prevPeriod.closingSupplierBalance,
        closingCash: String(summary.cashSummary.closingCashInHand),
        closingStockValue: String(summary.inventorySummary.closingStockValue),
        closingCustomerBalance: String(summary.customerSummary.totalCustomerReceivables),
        closingSupplierBalance: String(summary.supplierSummary.totalSupplierPayables),
        updatedAfterClosing: true,
        updatedAt: new Date(),
      }).where(eq(financialPeriodsTable.id, nextPeriod.id));

      await tx.insert(financialPeriodSnapshotsTable).values({
        periodId: nextPeriod.id,
        summary: { year: nextYear, month: nextMonth, status: "closed", recalculated: true, recalculatedAt: new Date().toISOString() },
        salesSummary: summary.salesSummary,
        purchaseSummary: summary.purchaseSummary,
        profitSummary: summary.profitSummary,
        inventorySummary: summary.inventorySummary,
        customerSummary: summary.customerSummary,
        supplierSummary: summary.supplierSummary,
        cashSummary: summary.cashSummary,
        topProducts: [],
        topCustomers: [],
        topSuppliers: [],
        kpiSummary: {
          netProfit: summary.profitSummary.netProfit,
          closingStockValue: summary.inventorySummary.closingStockValue,
          totalCustomerReceivables: summary.customerSummary.totalCustomerReceivables,
          totalSupplierPayables: summary.supplierSummary.totalSupplierPayables,
        },
      });

      await tx.insert(financialPeriodAuditLogsTable).values({
        periodId: nextPeriod.id,
        entityType: "month_closure",
        action: "recalculate",
        oldValue: null,
        newValue: JSON.stringify(summary),
        reason: `Recalculated because ${cursor.year}-${cursor.month} was reopened and edited`,
        performedByUserId: actorUserId,
        metadata: { cascadedFrom: cursor },
      });
    });

    cursor = { year: nextYear, month: nextMonth };
  }
}

async function getPreviousPeriod(year: number, month: number) {
  const previousDate = new Date(Date.UTC(year, month - 1, 1));
  previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
  const previousYear = previousDate.getUTCFullYear();
  const previousMonth = previousDate.getUTCMonth() + 1;
  const [row] = await db.select().from(financialPeriodsTable).where(and(eq(financialPeriodsTable.year, previousYear), eq(financialPeriodsTable.month, previousMonth)));
  return row ?? null;
}

async function buildWarnings(periodStart: Date, periodEnd: Date) {
  if (!db) return [];

  const pendingCustomerPayments = await db.select({ count: sql<number>`count(*)` }).from(salesTable).where(sql`${salesTable.saleDate} <= ${periodEnd} AND ${salesTable.status} = 'completed' AND (${salesTable.total}::numeric - ${salesTable.amountPaid}::numeric) > 0.005`);
  const pendingSupplierPayments = await db.select({ count: sql<number>`count(*)` }).from(purchasesTable).where(sql`${purchasesTable.purchaseDate} <= ${periodEnd} AND (${purchasesTable.total}::numeric - ${purchasesTable.amountPaid}::numeric) > 0.005`);
  const negativeStock = await db.select({ count: sql<number>`count(*)` }).from(productsTable).where(sql`${productsTable.currentStock} < 0`);
  const draftSales = await db.select({ count: sql<number>`count(*)` }).from(salesTable).where(sql`${salesTable.saleDate} >= ${periodStart} AND ${salesTable.saleDate} <= ${periodEnd} AND ${salesTable.status} = 'draft'`);
  const draftPurchases = await db.select({ count: sql<number>`count(*)` }).from(purchasesTable).where(sql`${purchasesTable.purchaseDate} >= ${periodStart} AND ${purchasesTable.purchaseDate} <= ${periodEnd} AND ${purchasesTable.status} = 'draft'`);
  const missingOpeningBalances = await db.select({ count: sql<number>`count(*)` }).from(financialPeriodsTable).where(and(eq(financialPeriodsTable.year, periodEnd.getFullYear()), eq(financialPeriodsTable.month, periodEnd.getMonth() + 1)));

  const warnings: string[] = [];
  if (toNumber(pendingCustomerPayments[0]?.count) > 0) warnings.push("Pending customer payments");
  if (toNumber(pendingSupplierPayments[0]?.count) > 0) warnings.push("Pending supplier payments");
  if (toNumber(negativeStock[0]?.count) > 0) warnings.push("Negative stock detected");
  if (toNumber(draftSales[0]?.count) > 0) warnings.push("Draft sales present");
  if (toNumber(draftPurchases[0]?.count) > 0) warnings.push("Draft purchases present");
  if (toNumber(missingOpeningBalances[0]?.count) === 0) warnings.push("Missing opening balances");
  return warnings;
}

export async function closeMonth(year: number, month: number, actorUserId: number | null, periodStart: Date, periodEnd: Date) {
  await ensureFinancialTablesReady();
  if (!db) throw new Error("Database unavailable");
  const summary = await computeMonthSummary(periodStart, periodEnd);
  const warnings = await buildWarnings(periodStart, periodEnd);

  const [existingPeriod] = await db.select().from(financialPeriodsTable).where(and(eq(financialPeriodsTable.year, year), eq(financialPeriodsTable.month, month)));
  if (existingPeriod && existingPeriod.status === "closed") {
    return {
      ok: true,
      alreadyClosed: true,
      message: `Month ${year}-${month} is already closed`,
      closure: null,
      period: existingPeriod,
      summary,
      warnings,
    };
  }

  const previousPeriod = await getPreviousPeriod(year, month);
  const openingCash = previousPeriod?.closingCash ?? "0";
  const openingStockValue = previousPeriod?.closingStockValue ?? "0";
  const openingCustomerBalance = previousPeriod?.closingCustomerBalance ?? "0";
  const openingSupplierBalance = previousPeriod?.closingSupplierBalance ?? "0";

  const inserted = await db.transaction(async (tx) => {
    const [existingPeriodRow] = await tx.select().from(financialPeriodsTable).where(and(eq(financialPeriodsTable.year, year), eq(financialPeriodsTable.month, month)));

    const periodValues = {
      status: "closed" as const,
      openingCash: String(openingCash),
      openingStockValue: String(openingStockValue),
      openingCustomerBalance: String(openingCustomerBalance),
      openingSupplierBalance: String(openingSupplierBalance),
      closingCash: String(summary.cashSummary.closingCashInHand),
      closingStockValue: String(summary.inventorySummary.closingStockValue),
      closingCustomerBalance: String(summary.customerSummary.totalCustomerReceivables),
      closingSupplierBalance: String(summary.supplierSummary.totalSupplierPayables),
      closedAt: new Date(),
      closedByUserId: actorUserId,
      updatedAfterClosing: false,
    };

    const [periodRow] = existingPeriodRow
      // Re-closing a month that was previously reopened: update the same
      // row in place rather than inserting a duplicate (year, month) row.
      ? await tx.update(financialPeriodsTable).set(periodValues).where(eq(financialPeriodsTable.id, existingPeriodRow.id)).returning()
      : await tx.insert(financialPeriodsTable).values({ year, month, ...periodValues }).returning();

    const [closureRow] = await tx.insert(monthClosuresTable).values({
      year,
      month,
      periodStart,
      periodEnd,
      totalSales: String(summary.salesSummary.totalSales),
      totalPurchases: String(summary.purchaseSummary.totalPurchases),
      totalExpenses: String(summary.profitSummary.totalExpenses),
      cashInHand: String(summary.cashSummary.closingCashInHand),
      closingStockValue: String(summary.inventorySummary.closingStockValue),
      customerOutstanding: String(summary.customerSummary.totalCustomerReceivables),
      supplierOutstanding: String(summary.supplierSummary.totalSupplierPayables),
      createdByUserId: actorUserId,
      isLocked: true,
    }).returning();

    await tx.insert(financialPeriodSnapshotsTable).values({
      periodId: periodRow.id,
      summary: {
        year,
        month,
        status: "closed",
        warnings,
        closedAt: new Date().toISOString(),
      },
      salesSummary: summary.salesSummary,
      purchaseSummary: summary.purchaseSummary,
      profitSummary: summary.profitSummary,
      inventorySummary: summary.inventorySummary,
      customerSummary: summary.customerSummary,
      supplierSummary: summary.supplierSummary,
      cashSummary: summary.cashSummary,
      topProducts: [],
      topCustomers: [],
      topSuppliers: [],
      kpiSummary: {
        netProfit: summary.profitSummary.netProfit,
        closingStockValue: summary.inventorySummary.closingStockValue,
        totalCustomerReceivables: summary.customerSummary.totalCustomerReceivables,
        totalSupplierPayables: summary.supplierSummary.totalSupplierPayables,
      },
    });

    await tx.insert(financialPeriodBalancesTable).values([
      {
        periodId: periodRow.id,
        balanceType: "cash",
        openingBalance: String(openingCash),
        closingBalance: String(summary.cashSummary.closingCashInHand),
        notes: "Carry forward from previous period",
        isCarryForward: true,
      },
      {
        periodId: periodRow.id,
        balanceType: "stock",
        openingBalance: String(openingStockValue),
        closingBalance: String(summary.inventorySummary.closingStockValue),
        notes: "Inventory balance",
      },
      {
        periodId: periodRow.id,
        balanceType: "customer",
        openingBalance: String(openingCustomerBalance),
        closingBalance: String(summary.customerSummary.totalCustomerReceivables),
        notes: "Customer receivables",
      },
      {
        periodId: periodRow.id,
        balanceType: "supplier",
        openingBalance: String(openingSupplierBalance),
        closingBalance: String(summary.supplierSummary.totalSupplierPayables),
        notes: "Supplier payables",
      },
    ]);

    await tx.insert(financialPeriodAuditLogsTable).values({
      periodId: periodRow.id,
      entityType: "month_closure",
      action: "close",
      oldValue: null,
      newValue: JSON.stringify(summary),
      reason: `Month closed for ${year}-${month}`,
      performedByUserId: actorUserId,
      metadata: { warnings },
    });

    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const [nextPeriod] = await tx.select().from(financialPeriodsTable).where(and(eq(financialPeriodsTable.year, nextYear), eq(financialPeriodsTable.month, nextMonth)));
    if (!nextPeriod) {
      await tx.insert(financialPeriodsTable).values({
        year: nextYear,
        month: nextMonth,
        status: "open",
        openingCash: String(summary.cashSummary.closingCashInHand),
        openingStockValue: String(summary.inventorySummary.closingStockValue),
        openingCustomerBalance: String(summary.customerSummary.totalCustomerReceivables),
        openingSupplierBalance: String(summary.supplierSummary.totalSupplierPayables),
      });
    } else {
      // Next period already existed (e.g. this month was closed out of
      // order, or is being re-closed after a reopen+edit) — refresh its
      // opening balances from this month's real closing numbers instead of
      // leaving them pointing at stale figures.
      await tx.update(financialPeriodsTable).set({
        openingCash: String(summary.cashSummary.closingCashInHand),
        openingStockValue: String(summary.inventorySummary.closingStockValue),
        openingCustomerBalance: String(summary.customerSummary.totalCustomerReceivables),
        openingSupplierBalance: String(summary.supplierSummary.totalSupplierPayables),
        updatedAfterClosing: nextPeriod.status === "closed" ? true : nextPeriod.updatedAfterClosing,
        updatedAt: new Date(),
      }).where(eq(financialPeriodsTable.id, nextPeriod.id));
    }

    return { closure: closureRow, period: periodRow, snapshot: { id: 0 }, summary, warnings };
  });

  // If any months after this one were already closed (out-of-order closing,
  // or this is a re-close after reopen+edit), their opening balances now
  // point at this month's freshly (re)computed closing numbers — cascade
  // the recompute forward so the whole chain of closed months agrees.
  await recalculateForwardChain(year, month, actorUserId);

  return inserted;
}

// `monthClosuresTable` and `financialPeriodsTable` used to be maintained as
// two separate, hand-kept-in-sync tables, which is a bug waiting to happen
// (an edit could update one and not the other). `financialPeriodsTable` is
// now the single source of truth for everything about a period's status and
// balances; `monthClosuresTable` is kept only as an immutable historical
// record written once at close time (for audit trail / legacy report
// exports), and is never read from for anything the UI displays live — the
// list/detail views below are derived entirely from financialPeriodsTable +
// financialPeriodSnapshotsTable instead, so there's only one place that can
// go stale.
export async function listClosures() {
  if (!db) return [];
  const periods = await db
    .select()
    .from(financialPeriodsTable)
    .where(eq(financialPeriodsTable.status, "closed"))
    .orderBy(desc(financialPeriodsTable.year), desc(financialPeriodsTable.month));

  const rows = await Promise.all(periods.map(async (period) => {
    const [snapshot] = await db
      .select()
      .from(financialPeriodSnapshotsTable)
      .where(eq(financialPeriodSnapshotsTable.periodId, period.id))
      .orderBy(desc(financialPeriodSnapshotsTable.createdAt))
      .limit(1);

    const salesSummary = (snapshot?.salesSummary as any) ?? {};
    const purchaseSummary = (snapshot?.purchaseSummary as any) ?? {};
    const profitSummary = (snapshot?.profitSummary as any) ?? {};

    return {
      id: period.id,
      year: period.year,
      month: period.month,
      periodStart: new Date(period.year, period.month - 1, 1),
      periodEnd: new Date(period.year, period.month, 0, 23, 59, 59, 999),
      total_sales: salesSummary.totalSales ?? 0,
      total_purchases: purchaseSummary.netPurchases ?? 0,
      total_expenses: profitSummary.totalExpenses ?? 0,
      cash_in_hand: toNumber(period.closingCash),
      closing_stock_value: toNumber(period.closingStockValue),
      customer_outstanding: toNumber(period.closingCustomerBalance),
      supplier_outstanding: toNumber(period.closingSupplierBalance),
      created_by_user_id: period.closedByUserId,
      is_locked: period.status === "closed",
      created_at: period.closedAt ?? period.createdAt,
      updated_after_closing: period.updatedAfterClosing,
    };
  }));

  return rows;
}

export async function getClosure(id: number) {
  if (!db) return null;
  const rows = await listClosures();
  return rows.find((r) => r.id === id) ?? null;
}

export async function getCurrentPeriodOverview() {
  logger.info({ dbPresent: Boolean(db), databaseEnvPresent: Boolean(process.env.DATABASE_URL) }, "months overview: db present?");
  await ensureFinancialTablesReady();
  if (!db) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return {
      year,
      month,
      period: null,
      lastClosure: null,
      snapshot: null,
      summary: createFallbackSummary(),
      warnings: [],
      degraded: true,
    };
  }
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);
  const [period] = await db.select().from(financialPeriodsTable).where(and(eq(financialPeriodsTable.year, year), eq(financialPeriodsTable.month, month)));
  const [snapshot] = await db.select().from(financialPeriodSnapshotsTable).where(eq(financialPeriodSnapshotsTable.periodId, period?.id ?? 0)).orderBy(desc(financialPeriodSnapshotsTable.createdAt));
  const summary = await computeMonthSummary(periodStart, periodEnd);
  const warnings = await buildWarnings(periodStart, periodEnd);
  const previousDate = new Date(year, month - 2, 1);
  const [lastClosedPeriod] = await db
    .select()
    .from(financialPeriodsTable)
    .where(and(eq(financialPeriodsTable.year, previousDate.getFullYear()), eq(financialPeriodsTable.month, previousDate.getMonth() + 1), eq(financialPeriodsTable.status, "closed")))
    .limit(1);
  return {
    year,
    month,
    period: period ?? null,
    lastClosure: lastClosedPeriod ?? null,
    snapshot: snapshot ?? null,
    summary,
    warnings,
  };
}

export async function reopenMonth(year: number, month: number, actorUserId: number | null, reason: string) {
  await ensureFinancialTablesReady();
  if (!db) throw new Error("Database unavailable");
  const [period] = await db.select().from(financialPeriodsTable).where(and(eq(financialPeriodsTable.year, year), eq(financialPeriodsTable.month, month)));
  if (!period) throw new Error("Period not found");
  await db.transaction(async (tx) => {
    await tx.update(financialPeriodsTable).set({ status: "open", updatedAfterClosing: true }).where(and(eq(financialPeriodsTable.year, year), eq(financialPeriodsTable.month, month)));
    await tx.insert(financialPeriodAuditLogsTable).values({
      periodId: period.id,
      entityType: "month_closure",
      action: "reopen",
      oldValue: period.status,
      newValue: "open",
      reason,
      performedByUserId: actorUserId,
      metadata: { reopenedAt: new Date().toISOString() },
    });
  });
  return { ok: true, year, month, reason };
}

export default { computeMonthSummary, closeMonth, listClosures, getClosure, getCurrentPeriodOverview, reopenMonth, recalculateForwardChain };
