import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  salesTable,
  purchasesTable,
  expensesTable,
  paymentsTable,
  supplierPaymentsTable,
  productsTable,
  auditLogTable,
  monthClosuresTable,
} from "@workspace/db";

export async function computeMonthSummary(periodStart: Date, periodEnd: Date) {
  const [{ total_sales }] = await db.select({ total_sales: sql<number>`coalesce(sum(${salesTable.total}::numeric), 0)` }).from(salesTable).where(sql`${salesTable.saleDate} >= ${periodStart} AND ${salesTable.saleDate} <= ${periodEnd} AND ${salesTable.status} = 'completed'`);

  const [{ total_purchases }] = await db.select({ total_purchases: sql<number>`coalesce(sum(${purchasesTable.total}::numeric), 0)` }).from(purchasesTable).where(sql`${purchasesTable.purchaseDate} >= ${periodStart} AND ${purchasesTable.purchaseDate} <= ${periodEnd}`);

  const [{ total_expenses }] = await db.select({ total_expenses: sql<number>`coalesce(sum(${expensesTable.amount}::numeric), 0)` }).from(expensesTable).where(sql`${expensesTable.createdAt} >= ${periodStart} AND ${expensesTable.createdAt} <= ${periodEnd}`);

  const [{ cash_in }] = await db.select({ cash_in: sql<number>`coalesce(sum(${paymentsTable.amount}::numeric), 0)` }).from(paymentsTable).where(sql`${paymentsTable.paymentDate} >= ${periodStart} AND ${paymentsTable.paymentDate} <= ${periodEnd}`);

  const [{ supplier_payments }] = await db.select({ supplier_payments: sql<number>`coalesce(sum(${supplierPaymentsTable.amount}::numeric), 0)` }).from(supplierPaymentsTable).where(sql`${supplierPaymentsTable.paymentDate} >= ${periodStart} AND ${supplierPaymentsTable.paymentDate} <= ${periodEnd}`);

  // Closing stock: rough snapshot using current stock * cost price
  const [{ closing_stock_value }] = await db.select({ closing_stock_value: sql<number>`coalesce(sum(${productsTable.currentStock}::numeric * ${productsTable.costPrice}::numeric), 0)` }).from(productsTable);

  // Customer outstanding — simple snapshot using unpaid totals up to period end
  const [{ customer_outstanding }] = await db.select({ customer_outstanding: sql<number>`coalesce(sum((${salesTable.total}::numeric - ${salesTable.amountPaid}::numeric)), 0)` }).from(salesTable).where(sql`${salesTable.saleDate} <= ${periodEnd} AND ${salesTable.status} = 'completed'`);

  // Supplier outstanding — purchases total minus amount paid
  const [{ supplier_outstanding }] = await db.select({ supplier_outstanding: sql<number>`coalesce(sum((${purchasesTable.total}::numeric - ${purchasesTable.amountPaid}::numeric)), 0)` }).from(purchasesTable).where(sql`${purchasesTable.purchaseDate} <= ${periodEnd}`);

  return {
    total_sales: Number(total_sales || 0),
    total_purchases: Number(total_purchases || 0),
    total_expenses: Number(total_expenses || 0),
    cash_in: Number(cash_in || 0) - Number(supplier_payments || 0) - Number(total_expenses || 0),
    closing_stock_value: Number(closing_stock_value || 0),
    customer_outstanding: Number(customer_outstanding || 0),
    supplier_outstanding: Number(supplier_outstanding || 0),
  };
}

export async function closeMonth(year: number, month: number, actorUserId: number | null, periodStart: Date, periodEnd: Date) {
  const summary = await computeMonthSummary(periodStart, periodEnd);

  // Prevent duplicate closures for same year/month unless forced
  const [existing] = await db.select().from(monthClosuresTable).where(sql`${monthClosuresTable.year} = ${year} AND ${monthClosuresTable.month} = ${month}`);
  if (existing) {
    throw new Error(`Month closure for ${year}-${month} already exists`);
  }

  const [inserted] = await db.transaction(async (tx) => {
    const [row] = await tx.insert(monthClosuresTable).values({
      year,
      month,
      periodStart,
      periodEnd,
      totalSales: String(summary.total_sales),
      totalPurchases: String(summary.total_purchases),
      totalExpenses: String(summary.total_expenses),
      cashInHand: String(summary.cash_in),
      closingStockValue: String(summary.closing_stock_value),
      customerOutstanding: String(summary.customer_outstanding),
      supplierOutstanding: String(summary.supplier_outstanding),
      createdByUserId: actorUserId,
    }).returning();

    // Write audit log entry for this closure
    await tx.insert(auditLogTable).values({
      entityType: 'month_closure',
      entityId: row.id,
      action: 'create',
      fieldName: null,
      oldValue: null,
      newValue: JSON.stringify(summary),
      reason: `Month closed for ${year}-${month}`,
      performedByUserId: actorUserId,
      ipAddress: null,
    });

    return row;
  });

  return inserted;
}

export async function listClosures() {
  const rows = await db.select().from(monthClosuresTable).orderBy(sql`${monthClosuresTable.year} DESC, ${monthClosuresTable.month} DESC`);
  return rows;
}

export async function getClosure(id: number) {
  const [row] = await db.select().from(monthClosuresTable).where(eq(monthClosuresTable.id, id));
  return row ?? null;
}

export default { computeMonthSummary, closeMonth, listClosures, getClosure };
