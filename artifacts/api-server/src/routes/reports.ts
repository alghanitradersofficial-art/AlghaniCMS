import { Router } from "express";
import { pool } from "@workspace/db";
import { db } from "@workspace/db";
import { productsTable, categoriesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { buildFinancialReportSummary } from "../lib/reporting-engine.js";

const router = Router();

router.get("/summary", async (req, res) => {
  try {
    const summary = await buildFinancialReportSummary(pool, {
      preset: (req.query.range as any) || "all",
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    return res.json(summary);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to generate shared report summary" });
  }
});

router.get("/profit-loss", async (req, res) => {
  try {
    const period = (req.query.period as string) || "monthly";
    const fromParam = req.query.from as string | undefined;
    const toParam = req.query.to as string | undefined;
    let intervals = 6;
    let intervalUnit = "month";

    if (period === "daily") { intervals = 7; intervalUnit = "day"; }
    else if (period === "weekly") { intervals = 8; intervalUnit = "week"; }
    else if (period === "monthly") { intervals = 6; intervalUnit = "month"; }
    else if (period === "yearly") { intervals = 3; intervalUnit = "year"; }

    // When an explicit custom range is given, the headline totals (revenue,
    // costOfGoods, expenses) are scoped to that range instead of all-time —
    // the trailing `breakdown` series below is unaffected and always shows
    // the last N intervals for trend context.
    const salesWhereParams: unknown[] = [];
    const purchaseWhereParams: unknown[] = [];
    const expenseWhereParams: unknown[] = [];
    let salesWhereClause = "";
    let purchaseWhereClause = "";
    let expenseWhereClause = "";

    if (fromParam && toParam) {
      const fromDate = new Date(fromParam);
      const toDate = new Date(new Date(toParam).setHours(23, 59, 59, 999));
      salesWhereClause = " AND sale_date >= $1 AND sale_date <= $2";
      purchaseWhereClause = " AND purchase_date >= $1 AND purchase_date <= $2";
      expenseWhereClause = " AND date::date >= $1::date AND date::date <= $2::date";
      salesWhereParams.push(fromDate.toISOString(), toDate.toISOString());
      purchaseWhereParams.push(fromDate.toISOString(), toDate.toISOString());
      expenseWhereParams.push(fromDate.toISOString().slice(0, 10), toDate.toISOString().slice(0, 10));
    }

    const [revenueRes, cogRes, expRes] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(total::numeric), 0) as total FROM sales WHERE status != 'cancelled'${salesWhereClause}`, salesWhereParams),
      pool.query(`SELECT COALESCE(SUM((item->>'quantity')::numeric * p.cost_price::numeric), 0) as total FROM sales s LEFT JOIN LATERAL jsonb_array_elements(s.items) AS item ON TRUE LEFT JOIN products p ON (item->>'productId')::int = p.id WHERE s.status != 'cancelled'${salesWhereClause}`, salesWhereParams),
      pool.query(`SELECT COALESCE(SUM(amount::numeric), 0) as total FROM expenses WHERE 1=1${expenseWhereClause}`, expenseWhereParams),
    ]);

    const revenue = parseFloat(revenueRes.rows[0].total);
    const costOfGoods = parseFloat(cogRes.rows[0].total);
    const expenses = parseFloat(expRes.rows[0].total);
    const grossProfit = revenue - costOfGoods;
    const netProfit = grossProfit - expenses;

    const breakdown = [];
    for (let i = intervals - 1; i >= 0; i--) {
      const date = new Date();
      let label = "";
      let startDate: Date;
      let endDate: Date;

      if (intervalUnit === "month") {
        date.setMonth(date.getMonth() - i);
        label = date.toLocaleString("default", { month: "short", year: "2-digit" });
        startDate = new Date(date.getFullYear(), date.getMonth(), 1);
        endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
      } else if (intervalUnit === "day") {
        date.setDate(date.getDate() - i);
        label = date.toLocaleDateString("default", { month: "short", day: "numeric" });
        startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
        endDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
      } else if (intervalUnit === "week") {
        date.setDate(date.getDate() - i * 7);
        label = `W${Math.ceil(date.getDate() / 7)} ${date.toLocaleString("default", { month: "short" })}`;
        startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
        endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
      } else {
        date.setFullYear(date.getFullYear() - i);
        label = String(date.getFullYear());
        startDate = new Date(date.getFullYear(), 0, 1);
        endDate = new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
      }

      const [sRes, cRes, eRes] = await Promise.all([
        pool.query(`SELECT COALESCE(SUM(total::numeric), 0) as total FROM sales WHERE status != 'cancelled' AND sale_date >= $1 AND sale_date <= $2`, [startDate.toISOString(), endDate.toISOString()]),
        pool.query(`SELECT COALESCE(SUM((item->>'quantity')::numeric * p.cost_price::numeric), 0) as total FROM sales s LEFT JOIN LATERAL jsonb_array_elements(s.items) AS item ON TRUE LEFT JOIN products p ON (item->>'productId')::int = p.id WHERE s.status != 'cancelled' AND s.sale_date >= $1 AND s.sale_date <= $2`, [startDate.toISOString(), endDate.toISOString()]),
        pool.query(`SELECT COALESCE(SUM(amount::numeric), 0) as total FROM expenses WHERE date::date >= $1::date AND date::date <= $2::date`, [startDate.toISOString().slice(0, 10), endDate.toISOString().slice(0, 10)]),
      ]);

      const s = parseFloat(sRes.rows[0].total);
      const c = parseFloat(cRes.rows[0].total);
      const e = parseFloat(eRes.rows[0].total);
      const gross = s - c;
      breakdown.push({ label, sales: s, purchases: c, profit: gross - e });
    }

    return res.json({ period, revenue, costOfGoods, grossProfit, expenses, netProfit, breakdown });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to generate profit/loss report" });
  }
});

router.get("/inventory", async (req, res) => {
  try {
    const [totalRes, catRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) as total_products, COALESCE(SUM(current_stock), 0) as total_stock, COALESCE(SUM(current_stock::numeric * cost_price::numeric), 0) as total_value FROM products`),
      pool.query(`
        SELECT c.name, COUNT(p.id) as count, COALESCE(SUM(p.current_stock::numeric * p.cost_price::numeric), 0) as value
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id
        GROUP BY c.id, c.name
        ORDER BY value DESC
      `),
    ]);

    return res.json({
      totalProducts: parseInt(totalRes.rows[0].total_products),
      totalStock: parseInt(totalRes.rows[0].total_stock),
      totalValue: parseFloat(totalRes.rows[0].total_value),
      categories: catRes.rows.map((r: Record<string, unknown>) => ({
        name: r.name,
        count: parseInt(r.count as string),
        value: parseFloat(r.value as string),
      })),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to generate inventory report" });
  }
});

export default router;
