import { Router } from "express";
import { pool } from "@workspace/db";
import { db } from "@workspace/db";
import { productsTable, categoriesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { buildFinancialReportSummary } from "../lib/reporting-engine.js";
import cashService from "../services/cash.service.js";
import { resolveRange, defaultBucketForRange } from "../lib/date-range.js";
import { groqChat } from "../lib/groq.js";
import { logger } from "../lib/logger.js";

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

// GET /api/reports/cash?period=daily|weekly|monthly&range=&from=&to=
// Cash-in-hand summary for the Reports page — same underlying data as
// /api/cash/report, exposed here too so Reports & Analytics can show it
// alongside Profit & Loss without a second page visit.
router.get("/cash", async (req, res) => {
  try {
    const { start, end } = resolveRange(req);
    const range = (req.query.range as string) || "all";
    const period = (req.query.period as "daily" | "weekly" | "monthly") || defaultBucketForRange(range);
    const report = await cashService.getCashReport(start, end, period);
    return res.json({ period, range, from: start?.toISOString() ?? null, to: end?.toISOString() ?? null, ...report });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to generate cash report" });
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

// GET /api/reports/sales-by-product?from=&to=
// How much of each product sold, by revenue and quantity, over the given
// range (defaults to all-time). Previously missing entirely — there was no
// way to see which product actually moved.
router.get("/sales-by-product", async (req, res) => {
  try {
    const { start, end } = resolveRange(req);
    const params: unknown[] = [];
    let whereClause = "WHERE s.status != 'cancelled'";
    if (start) { params.push(start.toISOString()); whereClause += ` AND s.sale_date >= $${params.length}`; }
    if (end) { params.push(end.toISOString()); whereClause += ` AND s.sale_date <= $${params.length}`; }

    const result = await pool.query(
      `
      SELECT
        (item->>'productId')::int AS product_id,
        MAX(item->>'productName') AS product_name,
        SUM((item->>'quantity')::numeric) AS quantity_sold,
        SUM((item->>'total')::numeric) AS revenue,
        COUNT(DISTINCT s.id) AS invoice_count
      FROM sales s
      LEFT JOIN LATERAL jsonb_array_elements(s.items) AS item ON TRUE
      ${whereClause}
      GROUP BY (item->>'productId')::int
      ORDER BY revenue DESC
      `,
      params,
    );

    return res.json({
      data: result.rows.map((r) => ({
        productId: r.product_id,
        productName: r.product_name,
        quantitySold: parseFloat(r.quantity_sold),
        revenue: parseFloat(r.revenue),
        invoiceCount: Number(r.invoice_count),
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to generate sales-by-product report");
    return res.status(500).json({ error: "Failed to generate sales-by-product report" });
  }
});

// GET /api/reports/customer-outstanding
// Convenience alias for the outstanding-balances report that already lived
// at GET /api/customers/ledger/reports/outstanding — kept there too, but
// exposed under /reports as well since that's where clients actually looked
// for it.
router.get("/customer-outstanding", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.name, c.phone, c.credit_limit,
             COALESCE(SUM(s.total - s.amount_paid) FILTER (WHERE s.status = 'completed'), 0) AS outstanding,
             COUNT(*) FILTER (WHERE s.status = 'completed' AND (s.total - s.amount_paid) > 0.005) AS pending_invoices,
             MIN(s.created_at) FILTER (WHERE s.status = 'completed' AND (s.total - s.amount_paid) > 0.005) AS oldest_unpaid_date
      FROM customers c
      LEFT JOIN sales s ON s.customer_id = c.id
      GROUP BY c.id, c.name, c.phone, c.credit_limit
      HAVING COALESCE(SUM(s.total - s.amount_paid) FILTER (WHERE s.status = 'completed'), 0) > 0.005
      ORDER BY outstanding DESC
    `);
    return res.json({
      data: result.rows.map((r) => ({
        customerId: r.id,
        customerName: r.name,
        phone: r.phone,
        creditLimit: parseFloat(r.credit_limit),
        outstanding: parseFloat(r.outstanding),
        pendingInvoices: Number(r.pending_invoices),
        oldestUnpaidDate: r.oldest_unpaid_date,
        overdueDays: r.oldest_unpaid_date
          ? Math.floor((Date.now() - new Date(r.oldest_unpaid_date).getTime()) / 86400000)
          : 0,
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to generate customer outstanding report");
    return res.status(500).json({ error: "Failed to generate customer outstanding report" });
  }
});

// GET /api/reports/supplier-outstanding
// Mirror of customer-outstanding, for what we owe suppliers. Was entirely
// missing before, so there was no report of unpaid POs.
router.get("/supplier-outstanding", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sup.id, sup.name, sup.phone,
             COALESCE(SUM(p.total - p.amount_paid) FILTER (WHERE p.status != 'cancelled'), 0) AS outstanding,
             COUNT(*) FILTER (WHERE p.status != 'cancelled' AND (p.total - p.amount_paid) > 0.005) AS pending_purchase_orders,
             MIN(p.purchase_date) FILTER (WHERE p.status != 'cancelled' AND (p.total - p.amount_paid) > 0.005) AS oldest_unpaid_date
      FROM suppliers sup
      LEFT JOIN purchases p ON p.supplier_id = sup.id
      GROUP BY sup.id, sup.name, sup.phone
      HAVING COALESCE(SUM(p.total - p.amount_paid) FILTER (WHERE p.status != 'cancelled'), 0) > 0.005
      ORDER BY outstanding DESC
    `);
    return res.json({
      data: result.rows.map((r) => ({
        supplierId: r.id,
        supplierName: r.name,
        phone: r.phone,
        outstanding: parseFloat(r.outstanding),
        pendingPurchaseOrders: Number(r.pending_purchase_orders),
        oldestUnpaidDate: r.oldest_unpaid_date,
        overdueDays: r.oldest_unpaid_date
          ? Math.floor((Date.now() - new Date(r.oldest_unpaid_date).getTime()) / 86400000)
          : 0,
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to generate supplier outstanding report");
    return res.status(500).json({ error: "Failed to generate supplier outstanding report" });
  }
});

// POST /api/reports/ai-insight { question: string }
// Answers a free-form question ("which product is most profitable?") using
// the existing Groq client (lib/groq.ts) grounded in a snapshot of the
// current profit/loss, inventory, and outstanding-balance numbers — the
// client already existed but had no route wired up to it.
router.post("/ai-insight", async (req, res): Promise<any> => {
  try {
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
    if (!question) return res.status(400).json({ error: "question is required" });

    const [invTotalRes, custOutRes, suppOutRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total_products, COALESCE(SUM(current_stock), 0) AS total_stock, COALESCE(SUM(current_stock::numeric * cost_price::numeric), 0) AS total_value FROM products`),
      pool.query(`SELECT COALESCE(SUM(s.total - s.amount_paid) FILTER (WHERE s.status = 'completed'), 0) AS total FROM sales s`),
      pool.query(`SELECT COALESCE(SUM(p.total - p.amount_paid) FILTER (WHERE p.status != 'cancelled'), 0) AS total FROM purchases p`),
    ]);

    const topProducts = await pool.query(`
      SELECT MAX(item->>'productName') AS product_name, SUM((item->>'total')::numeric) AS revenue
      FROM sales s LEFT JOIN LATERAL jsonb_array_elements(s.items) AS item ON TRUE
      WHERE s.status != 'cancelled'
      GROUP BY (item->>'productId')::int
      ORDER BY revenue DESC
      LIMIT 5
    `);

    const context = `
Inventory: ${invTotalRes.rows[0].total_products} products, ${invTotalRes.rows[0].total_stock} units in stock, value ${invTotalRes.rows[0].total_value} PKR.
Customer outstanding (receivable): ${custOutRes.rows[0].total} PKR.
Supplier outstanding (payable): ${suppOutRes.rows[0].total} PKR.
Top 5 products by revenue: ${topProducts.rows.map((r) => `${r.product_name}: ${r.revenue} PKR`).join(", ")}
`.trim();

    const answer = await groqChat([
      {
        role: "system",
        content:
          "You are a business analyst assistant for a wholesale trading ERP (Al Ghani Wholesale Traders). " +
          "Answer the user's question using only the numbers given in the context. Be concise, use PKR, and say clearly if the data given can't answer the question.",
      },
      { role: "user", content: `Context:\n${context}\n\nQuestion: ${question}` },
    ]);

    return res.json({ question, answer, context });
  } catch (error) {
    logger.error({ err: error }, "Failed to generate AI insight");
    const message = error instanceof Error && error.message === "GROQ_API_KEY not configured"
      ? "AI insights are not configured on this server (missing GROQ_API_KEY)."
      : "Failed to generate AI insight";
    return res.status(error instanceof Error && error.message === "GROQ_API_KEY not configured" ? 503 : 500).json({ error: message });
  }
});

export default router;
