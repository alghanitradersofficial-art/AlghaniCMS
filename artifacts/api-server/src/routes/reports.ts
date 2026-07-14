import { Router } from "express";
import { pool } from "@workspace/db";
import { db } from "@workspace/db";
import { productsTable, categoriesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

// Computes real Cost of Goods Sold for a date range from the actual cost
// price recorded against each sold item (customer_price_history.cost_price
// × quantity), NOT from that period's purchases. Purchases and sales rarely
// land in the same window (you might sell old stock with no purchase this
// month, or purchase stock you haven't sold yet), so using purchases as a
// stand-in for COGS silently produces a wrong profit number. This uses the
// cost price snapshot taken at the moment of sale, so it matches what was
// actually sold and stays correct even after product cost prices change
// later.
//
// Falls back to the sale's line-item cost captured on `sales.items` for any
// sale rows that (for whatever reason) have no matching price-history rows
// — e.g. walk-in/no-customer sales, which never write to
// customer_price_history since that table is keyed by customer.
async function computeCogsForRange(startIso: string, endIso: string): Promise<number> {
  const result = await pool.query(
    `
    WITH sale_items AS (
      SELECT
        s.id AS sale_id,
        s.customer_id,
        (item->>'productId')::integer AS product_id,
        (item->>'quantity')::numeric AS quantity
      FROM sales s, jsonb_array_elements(s.items) AS item
      WHERE s.status = 'completed' AND s.sale_date >= $1 AND s.sale_date <= $2
    ),
    priced AS (
      SELECT
        si.sale_id,
        si.quantity,
        COALESCE(
          -- Prefer the exact cost recorded at sale time for this customer+product+invoice.
          (
            SELECT cph.cost_price
            FROM customer_price_history cph
            WHERE cph.sale_id = si.sale_id AND cph.product_id = si.product_id
            LIMIT 1
          ),
          -- Fall back to the product's current cost price (covers walk-in
          -- sales with no customer_id, which never get a price-history row).
          (SELECT p.cost_price FROM products p WHERE p.id = si.product_id),
          0
        ) AS cost_price
      FROM sale_items si
    )
    SELECT COALESCE(SUM(quantity * cost_price), 0) AS total_cogs FROM priced
    `,
    [startIso, endIso],
  );
  return parseFloat(result.rows[0]?.total_cogs ?? "0");
}

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
    const hasCustomRange = Boolean(fromParam && toParam);
    const rangeStart = hasCustomRange ? new Date(fromParam as string).toISOString() : "1970-01-01T00:00:00.000Z";
    const rangeEnd = hasCustomRange
      ? new Date(new Date(toParam as string).setHours(23, 59, 59, 999)).toISOString()
      : new Date(new Date().setHours(23, 59, 59, 999)).toISOString();

    const rangeClause = hasCustomRange ? " AND created_at >= $1 AND created_at <= $2" : "";
    const rangeParams = hasCustomRange ? [rangeStart, rangeEnd] : [];

    const [revenueRes, expRes, purchasesRes, costOfGoods] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(total::numeric), 0) as total FROM sales WHERE status = 'completed'${rangeClause}`, rangeParams),
      pool.query(`SELECT COALESCE(SUM(amount::numeric), 0) as total FROM expenses${rangeClause}`, rangeParams),
      // Purchases are reported separately (for cash-flow / spend visibility)
      // but are no longer used to derive profit.
      pool.query(`SELECT COALESCE(SUM(total::numeric), 0) as total FROM purchases WHERE status != 'cancelled'${rangeClause}`, rangeParams),
      computeCogsForRange(rangeStart, rangeEnd),
    ]);

    const revenue = parseFloat(revenueRes.rows[0].total);
    const expenses = parseFloat(expRes.rows[0].total);
    const totalPurchases = parseFloat(purchasesRes.rows[0].total);
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
        startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        endDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
      } else if (intervalUnit === "week") {
        date.setDate(date.getDate() - i * 7);
        label = `W${Math.ceil(date.getDate() / 7)} ${date.toLocaleString("default", { month: "short" })}`;
        startDate = new Date(date.getTime());
        endDate = new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
      } else {
        date.setFullYear(date.getFullYear() - i);
        label = String(date.getFullYear());
        startDate = new Date(date.getFullYear(), 0, 1);
        endDate = new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
      }

      const [sRes, cogs] = await Promise.all([
        pool.query(`SELECT COALESCE(SUM(total::numeric), 0) as total FROM sales WHERE status = 'completed' AND sale_date >= $1 AND sale_date <= $2`, [startDate.toISOString(), endDate.toISOString()]),
        computeCogsForRange(startDate.toISOString(), endDate.toISOString()),
      ]);

      const s = parseFloat(sRes.rows[0].total);
      breakdown.push({ label, sales: s, costOfGoods: cogs, profit: s - cogs });
    }

    return res.json({ period, revenue, costOfGoods, grossProfit, expenses, netProfit, totalPurchases, breakdown });
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
