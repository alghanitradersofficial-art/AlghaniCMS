import { Router } from "express";
import { pool } from "@workspace/db";
import { db } from "@workspace/db";
import { productsTable } from "@workspace/db";
import { lte, sql } from "drizzle-orm";

const router = Router();

router.get("/summary", async (req, res) => {
  try {
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
        SELECT COALESCE(SUM((item->>'quantity')::numeric * (item->>'unitPrice')::numeric), 0) AS revenue
        FROM sales s
        LEFT JOIN LATERAL jsonb_array_elements(s.items) AS item ON TRUE
        WHERE s.status != 'cancelled'
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

    return res.json({
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
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch dashboard summary" });
  }
});

router.get("/sales-chart", async (req, res) => {
  try {
    const months = parseInt(req.query.months as string) || 6;
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

    return res.json(result.rows.map((row: Record<string, unknown>) => ({
      label: String(row.label),
      sales: parseFloat(row.sales as string || "0"),
      purchases: parseFloat(row.purchases as string || "0"),
      profit: parseFloat(row.profit as string || "0"),
    })));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch sales chart" });
  }
});

router.get("/recent-activity", async (req, res) => {
  try {
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

    return res.json(all);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch recent activity" });
  }
});

router.get("/top-products", async (req, res) => {
  try {
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
    return res.json(result.rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      sku: r.sku,
      totalSold: parseInt(r.total_sold as string) || 0,
      revenue: parseFloat(r.revenue as string) || 0,
    })));
  } catch (error) {
    console.error(error);
    try {
      const fallback = await pool.query(`SELECT id, name, sku, sale_price FROM products ORDER BY sale_price::numeric DESC LIMIT 5`);
      return res.json(fallback.rows.map((r: Record<string, unknown>) => ({ id: r.id, name: r.name, sku: r.sku, totalSold: 0, revenue: parseFloat(r.sale_price as string) })));
    } catch (e) {
      return res.status(500).json({ error: "Failed to fetch top products" });
    }
  }
});

router.get("/low-stock", async (req, res) => {
  try {
    const result = await pool.query(`SELECT id, name, sku, current_stock, min_stock FROM products WHERE current_stock <= min_stock ORDER BY current_stock ASC LIMIT 10`);
    return res.json(result.rows.map((r: Record<string, unknown>) => ({
      id: r.id, name: r.name, sku: r.sku,
      currentStock: Number(r.current_stock),
      minStock: Number(r.min_stock),
    })));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch low stock" });
  }
});

export default router;
