import { Router } from 'express';
import { db, sales, purchases, expenses, products, customers, saleItems } from '@workspace/db';
import { sql, gte, and } from 'drizzle-orm';
import { authMiddleware } from '../lib/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/summary', async (_req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [salesTotals] = await db.select({
      total: sql<number>`COALESCE(SUM(CAST(total AS NUMERIC)), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(sales);

    const [purchaseTotals] = await db.select({
      total: sql<number>`COALESCE(SUM(CAST(total AS NUMERIC)), 0)`,
    }).from(purchases);

    const [expenseTotals] = await db.select({
      total: sql<number>`COALESCE(SUM(CAST(amount AS NUMERIC)), 0)`,
    }).from(expenses);

    const [productCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(products);
    const [customerCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(customers);

    const [todaySalesRow] = await db.select({
      total: sql<number>`COALESCE(SUM(CAST(total AS NUMERIC)), 0)`,
    }).from(sales).where(gte(sales.saleDate, todayStart));

    const [weeklySalesRow] = await db.select({
      total: sql<number>`COALESCE(SUM(CAST(total AS NUMERIC)), 0)`,
    }).from(sales).where(gte(sales.saleDate, weekStart));

    const [monthlySalesRow] = await db.select({
      total: sql<number>`COALESCE(SUM(CAST(total AS NUMERIC)), 0)`,
    }).from(sales).where(gte(sales.saleDate, monthStart));

    const [lowStockCount] = await db.select({
      count: sql<number>`COUNT(*)`,
    }).from(products).where(sql`CAST(current_stock AS NUMERIC) <= CAST(min_stock AS NUMERIC)`);

    const totalSales = Number(salesTotals.total);
    const totalPurchases = Number(purchaseTotals.total);
    const totalExpenses = Number(expenseTotals.total);
    const grossProfit = totalSales - totalPurchases;
    const netProfit = grossProfit - totalExpenses;

    return res.json({
      totalSales,
      totalPurchases,
      totalExpenses,
      grossProfit,
      netProfit,
      totalProducts: Number(productCount.count),
      totalCustomers: Number(customerCount.count),
      pendingOrders: 0,
      lowStockCount: Number(lowStockCount.count),
      todaySales: Number(todaySalesRow.total),
      weeklySales: Number(weeklySalesRow.total),
      monthlySales: Number(monthlySalesRow.total),
      totalRevenue: totalSales,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

router.get('/sales-chart', async (req, res) => {
  try {
    const months = Number(req.query.months) || 6;
    const results = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const label = start.toLocaleString('default', { month: 'short', year: '2-digit' });

      const [s] = await db.select({ total: sql<number>`COALESCE(SUM(CAST(total AS NUMERIC)), 0)` }).from(sales)
        .where(and(gte(sales.saleDate, start), sql`sale_date <= ${end}`));
      const [p] = await db.select({ total: sql<number>`COALESCE(SUM(CAST(total AS NUMERIC)), 0)` }).from(purchases)
        .where(and(gte(purchases.purchaseDate, start), sql`purchase_date <= ${end}`));

      const salesAmt = Number(s.total);
      const purchaseAmt = Number(p.total);
      results.push({ label, sales: salesAmt, purchases: purchaseAmt, profit: salesAmt - purchaseAmt });
    }
    return res.json(results);
  } catch {
    return res.status(500).json({ error: 'Chart failed' });
  }
});

router.get('/recent-activity', async (_req, res) => {
  try {
    const recentSales = await db.select().from(sales).orderBy(sql`created_at DESC`).limit(5);
    const activity = recentSales.map(s => ({
      id: s.id,
      type: 'sale',
      description: `Sale #${s.invoiceNumber} - ${s.customerName}`,
      amount: Number(s.total),
      createdAt: s.createdAt.toISOString(),
    }));
    return res.json(activity);
  } catch {
    return res.status(500).json({ error: 'Failed to load activity' });
  }
});

router.get('/top-products', async (_req, res) => {
  try {
    const rows = await db.select({
      productId: saleItems.productId,
      productName: saleItems.productName,
      totalSold: sql<number>`SUM(CAST(quantity AS NUMERIC))`,
      revenue: sql<number>`SUM(CAST(total AS NUMERIC))`,
    }).from(saleItems)
      .groupBy(saleItems.productId, saleItems.productName)
      .orderBy(sql`SUM(CAST(total AS NUMERIC)) DESC`)
      .limit(10);

    return res.json(rows.map(r => ({
      id: r.productId,
      name: r.productName,
      sku: '',
      totalSold: Number(r.totalSold),
      revenue: Number(r.revenue),
    })));
  } catch {
    return res.status(500).json({ error: 'Failed to load top products' });
  }
});

router.get('/low-stock', async (_req, res) => {
  try {
    const rows = await db.select().from(products)
      .where(sql`CAST(current_stock AS NUMERIC) <= CAST(min_stock AS NUMERIC)`)
      .limit(20);
    return res.json(rows.map(p => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      currentStock: Number(p.currentStock),
      minStock: Number(p.minStock),
    })));
  } catch {
    return res.status(500).json({ error: 'Failed to load alerts' });
  }
});

export default router;
