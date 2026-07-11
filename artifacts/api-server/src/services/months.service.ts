import { db } from "@workspace/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";
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
} from "@workspace/db";

function toNumber(value: unknown): number {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function computeMonthSummary(periodStart: Date, periodEnd: Date) {
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

  const totalSales = toNumber(total_sales);
  const discountValue = toNumber(total_sales_discount);
  const netSales = totalSales - discountValue;
  const netPurchases = toNumber(total_purchases);
  const grossProfit = netSales - netPurchases;
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

async function getPreviousPeriod(year: number, month: number) {
  const previousDate = new Date(Date.UTC(year, month - 1, 1));
  previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
  const previousYear = previousDate.getUTCFullYear();
  const previousMonth = previousDate.getUTCMonth() + 1;
  const [row] = await db.select().from(financialPeriodsTable).where(and(eq(financialPeriodsTable.year, previousYear), eq(financialPeriodsTable.month, previousMonth)));
  return row ?? null;
}

async function buildWarnings(periodStart: Date, periodEnd: Date) {
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
  const summary = await computeMonthSummary(periodStart, periodEnd);
  const warnings = await buildWarnings(periodStart, periodEnd);

  const [existingClosure] = await db.select().from(monthClosuresTable).where(and(eq(monthClosuresTable.year, year), eq(monthClosuresTable.month, month)));
  if (existingClosure) {
    throw new Error(`Month closure for ${year}-${month} already exists`);
  }

  const previousPeriod = await getPreviousPeriod(year, month);
  const openingCash = previousPeriod?.closingCash ?? "0";
  const openingStockValue = previousPeriod?.closingStockValue ?? "0";
  const openingCustomerBalance = previousPeriod?.closingCustomerBalance ?? "0";
  const openingSupplierBalance = previousPeriod?.closingSupplierBalance ?? "0";

  const inserted = await db.transaction(async (tx) => {
    const [periodRow] = await tx.insert(financialPeriodsTable).values({
      year,
      month,
      status: "closed",
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
    }).returning();

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
    }

    return { closure: closureRow, period: periodRow, snapshot: { id: 0 }, summary, warnings };
  });

  return inserted;
}

export async function listClosures() {
  const rows = await db.select().from(monthClosuresTable).orderBy(desc(monthClosuresTable.year), desc(monthClosuresTable.month));
  return rows;
}

export async function getClosure(id: number) {
  const [row] = await db.select().from(monthClosuresTable).where(eq(monthClosuresTable.id, id));
  return row ?? null;
}

export async function getCurrentPeriodOverview() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);
  const [period] = await db.select().from(financialPeriodsTable).where(and(eq(financialPeriodsTable.year, year), eq(financialPeriodsTable.month, month)));
  const [snapshot] = await db.select().from(financialPeriodSnapshotsTable).where(eq(financialPeriodSnapshotsTable.periodId, period?.id ?? 0)).orderBy(desc(financialPeriodSnapshotsTable.createdAt));
  const summary = await computeMonthSummary(periodStart, periodEnd);
  const warnings = await buildWarnings(periodStart, periodEnd);
  const [lastClosure] = await db.select().from(monthClosuresTable).where(and(eq(monthClosuresTable.year, year), eq(monthClosuresTable.month, month - 1))).limit(1);
  return {
    year,
    month,
    period: period ?? null,
    lastClosure: lastClosure ?? null,
    snapshot: snapshot ?? null,
    summary,
    warnings,
  };
}

export async function reopenMonth(year: number, month: number, actorUserId: number | null, reason: string) {
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

export default { computeMonthSummary, closeMonth, listClosures, getClosure, getCurrentPeriodOverview, reopenMonth };
