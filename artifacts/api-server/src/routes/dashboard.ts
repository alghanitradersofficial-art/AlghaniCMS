import { Router } from "express";
import { pool } from "@workspace/db";
import { db } from "@workspace/db";
import { productsTable, generalLedgerEntriesTable } from "@workspace/db";
import { lte, sql, and, gte } from "drizzle-orm";

const router = Router();
const dashboardCache = new Map<string, { expiresAt: number; value: unknown }>();

function getCached<T>(key: string): T | null {
  const entry = dashboardCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    dashboardCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T, ttlMs = 15000): T {
  dashboardCache.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
}


/**
 * Resolves a `range` query param (today | week | month | year | all | custom)
 * plus optional `from`/`to` into a concrete [start, end] Date pair. Shared by
 * every date-range-aware endpoint below and intended to match the same
 * presets used by the frontend's shared DateRangeSelector component.
 */
function resolveRange(req: import("express").Request): { start: Date | null; end: Date | null } {
  const range = (req.query.range as string) || "all";
  const now = new Date();

  if (range === "custom") {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    return {
      start: from ? new Date(from) : null,
      end: to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : null,
    };
  }
  if (range === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { start, end: now };
  }
  if (range === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }
  if (range === "month") {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
  }
  if (range === "year") {
    return { start: new Date(now.getFullYear(), 0, 1), end: now };
  }
  return { start: null, end: null }; // "all"
}

// GET /api/dashboard/summary-range?range=today|week|month|year|all|custom&from=&to=
// Range-aware KPI summary driven by the shared date-range selector (section 5).
// "all" returns true lifetime totals — the existing /summary endpoint below is
// kept unchanged for backward compatibility and is equivalent to range=all.
router.get("/summary-range", async (req, res): Promise<any> => {
  try {
    const { start, end } = resolveRange(req);
    const cacheKey = `dashboard:summary-range:${(req.query.range as string) || "all"}:${start?.toISOString() ?? "all"}:${end?.toISOString() ?? "all"}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const conditions = [];
    if (start) conditions.push(gte(generalLedgerEntriesTable.date, start));
    if (end) conditions.push(lte(generalLedgerEntriesTable.date, end));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [byType] = await Promise.all([
      db
        .select({
          type: generalLedgerEntriesTable.type,
          direction: generalLedgerEntriesTable.direction,
          total: sql<string>`COALESCE(SUM(${generalLedgerEntriesTable.amount}), 0)`,
          count: sql<string>`COUNT(*)`,
        })
        .from(generalLedgerEntriesTable)
        .where(whereClause)
        .groupBy(generalLedgerEntriesTable.type, generalLedgerEntriesTable.direction),
    ]);

    const totals: Record<string, number> = {};
    let salesCount = 0;
    for (const row of byType) {
      const amount = parseFloat(row.total);
      totals[row.type] = (totals[row.type] ?? 0) + amount;
      if (row.type === "sale") salesCount += parseInt(row.count);
    }

    const totalRevenue = totals["sale"] ?? 0;
    const totalPurchases = totals["purchase"] ?? 0;
    const totalExpenses = totals["expense"] ?? 0;
    const netProfit = totalRevenue - totalPurchases - totalExpenses;

    // Lifetime-only figures that don't make sense to range-filter (current
    // stock value, total counts) are always computed as true "all time".
    const [productsRes, customersRes, suppliersRes, inventoryValueRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS count FROM products`),
      pool.query(`SELECT COUNT(*) AS count FROM customers`),
      pool.query(`SELECT COUNT(*) AS count FROM suppliers`),
      pool.query(`SELECT COALESCE(SUM(current_stock::numeric * cost_price::numeric), 0) AS value FROM products`),
    ]);

    return res.json(setCached(cacheKey, {
      range: (req.query.range as string) || "all",
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalPurchases: Math.round(totalPurchases * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      salesCount,
      totalProducts: parseInt(productsRes.rows[0].count, 10),
      totalCustomers: parseInt(customersRes.rows[0].count, 10),
      totalSuppliers: parseInt(suppliersRes.rows[0].count, 10),
      inventoryValue: parseFloat(inventoryValueRes.rows[0].value),
    }, 10000));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch range-aware dashboard summary" });
  }
});

// GET /api/dashboard/recent-activity-range?range=&from=&to=&limit=
router.get("/recent-activity-range", async (req, res): Promise<any> => {
  try {
    const { start, end } = resolveRange(req);
    const limit = parseInt(req.query.limit as string) || 15;
    const conditions = [];
    if (start) conditions.push(gte(generalLedgerEntriesTable.date, start));
    if (end) conditions.push(lte(generalLedgerEntriesTable.date, end));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(generalLedgerEntriesTable)
      .where(whereClause)
      .orderBy(sql`${generalLedgerEntriesTable.date} DESC`)
      .limit(limit);

    return res.json(rows.map((r) => ({
      id: r.id,
      type: r.type,
      description: r.note || `${r.type} — ${r.partyName ?? ""}`,
      amount: parseFloat(r.amount as string),
      direction: r.direction,
      partyType: r.partyType,
      partyName: r.partyName,
      createdAt: r.date.toISOString(),
    })));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch recent activity" });
  }
});

router.get("/summary", async (req, res) => {
  try {
    const cacheKey = "dashboard:summary";
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const [
      revenueRes,
      cogsRes,
      purchasesRes,
      expensesRes,
      productsRes,
      customersRes,
      pendingRes,
      completedRes,
      lowStockRes,
      outOfStockRes,
      todaySalesRes,
      weeklySalesRes,
      monthlySalesRes,
      todayPurchasesRes,
      weeklyPurchasesRes,
      monthlyPurchasesRes,
      inventoryValueRes,
    ] = await Promise.all([
      pool.query(`
        SELECT COALESCE(SUM(total::numeric), 0) AS revenue
        FROM sales
        WHERE status != 'cancelled'
      `),
      pool.query(`
        SELECT COALESCE(SUM((item->>'quantity')::numeric * p.cost_price::numeric), 0) AS cogs
        FROM sales s
        LEFT JOIN LATERAL jsonb_array_elements(s.items) AS item ON TRUE
        LEFT JOIN products p ON (item->>'productId')::int = p.id
        WHERE s.status != 'cancelled'
      `),
      pool.query(`SELECT COALESCE(SUM(total::numeric), 0) AS total FROM purchases WHERE status != 'cancelled'`),
      pool.query(`SELECT COALESCE(SUM(amount::numeric), 0) AS total FROM expenses`),
      pool.query(`SELECT COUNT(*) AS count FROM products`),
      pool.query(`SELECT COUNT(*) AS count FROM customers`),
      pool.query(`SELECT COUNT(*) AS count FROM sales WHERE status = 'pending'`),
      pool.query(`SELECT COUNT(*) AS count FROM sales WHERE status = 'completed'`),
      pool.query(`SELECT COUNT(*) AS count FROM products WHERE current_stock <= min_stock`),
      pool.query(`SELECT COUNT(*) AS count FROM products WHERE current_stock = 0`),
      pool.query(`
        SELECT COALESCE(SUM((item->>'quantity')::numeric * (item->>'unitPrice')::numeric), 0) AS total
        FROM sales s
        LEFT JOIN LATERAL jsonb_array_elements(s.items) AS item ON TRUE
        WHERE s.status != 'cancelled' AND s.created_at >= date_trunc('day', now())
      `),
      pool.query(`
        SELECT COALESCE(SUM((item->>'quantity')::numeric * (item->>'unitPrice')::numeric), 0) AS total
        FROM sales s
        LEFT JOIN LATERAL jsonb_array_elements(s.items) AS item ON TRUE
        WHERE s.status != 'cancelled' AND s.created_at >= date_trunc('week', now())
      `),
      pool.query(`
        SELECT COALESCE(SUM((item->>'quantity')::numeric * (item->>'unitPrice')::numeric), 0) AS total
        FROM sales s
        LEFT JOIN LATERAL jsonb_array_elements(s.items) AS item ON TRUE
        WHERE s.status != 'cancelled' AND s.created_at >= date_trunc('month', now())
      `),
      pool.query(`SELECT COALESCE(SUM(total::numeric), 0) AS total FROM purchases WHERE status != 'cancelled' AND created_at >= date_trunc('day', now())`),
      pool.query(`SELECT COALESCE(SUM(total::numeric), 0) AS total FROM purchases WHERE status != 'cancelled' AND created_at >= date_trunc('week', now())`),
      pool.query(`SELECT COALESCE(SUM(total::numeric), 0) AS total FROM purchases WHERE status != 'cancelled' AND created_at >= date_trunc('month', now())`),
      pool.query(`SELECT COALESCE(SUM(current_stock::numeric * cost_price::numeric), 0) AS value FROM products`),
    ]);

    const totalRevenue = parseFloat(revenueRes.rows[0].revenue);
    const purchaseCost = parseFloat(cogsRes.rows[0].cogs);
    const totalPurchases = parseFloat(purchasesRes.rows[0].total);
    const totalExpenses = parseFloat(expensesRes.rows[0].total);
    const grossProfit = totalRevenue - purchaseCost;
    const netProfit = grossProfit - totalExpenses;

    return res.json(setCached(cacheKey, {
      totalRevenue,
      purchaseCost,
      totalPurchases,
      totalExpenses,
      grossProfit,
      netProfit,
      totalProducts: parseInt(productsRes.rows[0].count, 10),
      totalCustomers: parseInt(customersRes.rows[0].count, 10),
      pendingOrders: parseInt(pendingRes.rows[0].count, 10),
      completedOrders: parseInt(completedRes.rows[0].count, 10),
      lowStockCount: parseInt(lowStockRes.rows[0].count, 10),
      outOfStockCount: parseInt(outOfStockRes.rows[0].count, 10),
      todaySales: parseFloat(todaySalesRes.rows[0].total),
      weeklySales: parseFloat(weeklySalesRes.rows[0].total),
      monthlySales: parseFloat(monthlySalesRes.rows[0].total),
      todayPurchases: parseFloat(todayPurchasesRes.rows[0].total),
      weeklyPurchases: parseFloat(weeklyPurchasesRes.rows[0].total),
      monthlyPurchases: parseFloat(monthlyPurchasesRes.rows[0].total),
      inventoryValue: parseFloat(inventoryValueRes.rows[0].value),
    }, 15000));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch dashboard summary" });
  }
});

router.get("/sales-chart", async (req, res) => {
  try {
    const months = parseInt(req.query.months as string) || 6;
    const cacheKey = `dashboard:sales-chart:${months}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const result = await pool.query(
      `WITH month_series AS (
          SELECT generate_series(
            date_trunc('month', now()) - ($1::int - 1) * interval '1 month',
            date_trunc('month', now()),
            interval '1 month'
          ) AS month_start
        ),
        sales_revenue AS (
          SELECT date_trunc('month', s.created_at) AS month_start,
            COALESCE(SUM((item->>'quantity')::numeric * (item->>'unitPrice')::numeric), 0) AS revenue,
            COALESCE(SUM((item->>'quantity')::numeric * p.cost_price::numeric), 0) AS cogs
          FROM sales s
          LEFT JOIN LATERAL jsonb_array_elements(s.items) AS item ON TRUE
          LEFT JOIN products p ON (item->>'productId')::int = p.id
          WHERE s.status != 'cancelled'
          GROUP BY date_trunc('month', s.created_at)
        ),
        purchases_total AS (
          SELECT date_trunc('month', created_at) AS month_start,
            COALESCE(SUM(total::numeric), 0) AS purchases
          FROM purchases
          WHERE status != 'cancelled'
          GROUP BY date_trunc('month', created_at)
        )
        SELECT to_char(ms.month_start, 'Mon YY') AS label,
          COALESCE(sr.revenue, 0) AS sales,
          COALESCE(pt.purchases, 0) AS purchases,
          COALESCE(sr.revenue, 0) - COALESCE(sr.cogs, 0) AS profit
        FROM month_series ms
        LEFT JOIN sales_revenue sr ON sr.month_start = ms.month_start
        LEFT JOIN purchases_total pt ON pt.month_start = ms.month_start
        ORDER BY ms.month_start;
      `,
      [months],
    );

    return res.json(setCached(cacheKey, result.rows.map((row: Record<string, unknown>) => ({
      label: String(row.label),
      sales: parseFloat(row.sales as string || "0"),
      purchases: parseFloat(row.purchases as string || "0"),
      profit: parseFloat(row.profit as string || "0"),
    })), 15000));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch sales chart" });
  }
});

router.get("/recent-activity", async (req, res) => {
  try {
    const cacheKey = "dashboard:recent-activity";
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);
    const [salesRes, purchasesRes, expensesRes] = await Promise.all([
      pool.query(`SELECT id, 'sale' as type, 'Sale #' || invoice_number || ' - ' || customer_name as description, total::numeric as amount, created_at FROM sales ORDER BY created_at DESC LIMIT 5`),
      pool.query(`SELECT id, 'purchase' as type, 'PO #' || po_number || ' - ' || supplier_name as description, total::numeric as amount, created_at FROM purchases ORDER BY created_at DESC LIMIT 5`),
      pool.query(`SELECT id, 'expense' as type, 'Expense: ' || title as description, amount::numeric as amount, created_at FROM expenses ORDER BY created_at DESC LIMIT 3`),
    ]);

    const all = [
      ...salesRes.rows.map((r: Record<string, unknown>) => ({ id: r.id, type: r.type, description: r.description, amount: parseFloat(r.amount as string), createdAt: (r.created_at as Date).toISOString() })),
      ...purchasesRes.rows.map((r: Record<string, unknown>) => ({ id: r.id, type: r.type, description: r.description, amount: parseFloat(r.amount as string), createdAt: (r.created_at as Date).toISOString() })),
      ...expensesRes.rows.map((r: Record<string, unknown>) => ({ id: r.id, type: r.type, description: r.description, amount: parseFloat(r.amount as string), createdAt: (r.created_at as Date).toISOString() })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);

    return res.json(setCached(cacheKey, all, 10000));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch recent activity" });
  }
});

router.get("/top-products", async (req, res) => {
  const cacheKey = "dashboard:top-products";
  try {
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);
    const result = await pool.query(`
      SELECT p.id, p.name, p.sku,
        COALESCE(SUM((item->>'quantity')::int), 0) as total_sold,
        COALESCE(SUM((item->>'total')::numeric), 0) as revenue
      FROM products p
      LEFT JOIN (
        SELECT jsonb_array_elements(items) as item FROM sales WHERE status != 'cancelled'
      ) si ON (si.item->>'productId')::int = p.id
      GROUP BY p.id, p.name, p.sku
      ORDER BY revenue DESC
      LIMIT 5
    `);
    return res.json(setCached(cacheKey, result.rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      sku: r.sku,
      totalSold: parseInt(r.total_sold as string) || 0,
      revenue: parseFloat(r.revenue as string) || 0,
    })), 15000));
  } catch (error) {
    console.error(error);
    try {
      const fallback = await pool.query(`SELECT id, name, sku, sale_price FROM products ORDER BY sale_price::numeric DESC LIMIT 5`);
      return res.json(setCached(cacheKey, fallback.rows.map((r: Record<string, unknown>) => ({ id: r.id, name: r.name, sku: r.sku, totalSold: 0, revenue: parseFloat(r.sale_price as string) })), 15000));
    } catch (e) {
      return res.status(500).json({ error: "Failed to fetch top products" });
    }
  }
});

router.get("/low-stock", async (req, res) => {
  try {
    const cacheKey = "dashboard:low-stock";
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);
    const result = await pool.query(`SELECT id, name, sku, current_stock, min_stock FROM products WHERE current_stock <= min_stock ORDER BY current_stock ASC LIMIT 10`);
    return res.json(setCached(cacheKey, result.rows.map((r: Record<string, unknown>) => ({
      id: r.id, name: r.name, sku: r.sku,
      currentStock: Number(r.current_stock),
      minStock: Number(r.min_stock),
    })), 15000));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch low stock" });
  }
});

export default router;
