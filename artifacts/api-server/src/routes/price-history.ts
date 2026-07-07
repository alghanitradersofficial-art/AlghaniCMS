import { Router } from "express";
import { db, priceHistoryTable, productsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { round2 } from "../lib/ledger.js";

const router = Router();

function fmt(entry: typeof priceHistoryTable.$inferSelect) {
  return {
    id: entry.id,
    productId: entry.productId,
    productName: entry.productName,
    sku: entry.sku,
    saleId: entry.saleId,
    invoiceNumber: entry.invoiceNumber,
    invoiceDate: entry.invoiceDate.toISOString(),
    quantity: parseFloat(entry.quantity as string),
    unitPrice: parseFloat(entry.unitPrice as string),
    discount: parseFloat(entry.discount as string),
    finalPrice: parseFloat(entry.finalPrice as string),
    costPrice: parseFloat(entry.costPrice as string),
    profitAmount: parseFloat(entry.profitAmount as string),
    profitPercentage: parseFloat(entry.profitPercentage as string),
  };
}

/**
 * GET /api/customers/:customerId/price-history/:productId
 * The "instant popup" data for section 1: last price, last N sales, min/max/avg,
 * totals, days since last purchase.
 */
router.get("/:customerId/price-history/:productId", async (req, res) => {
  try {
    const customerId = parseInt(req.params.customerId);
    const productId = parseInt(req.params.productId);

    const history = await db
      .select()
      .from(priceHistoryTable)
      .where(and(eq(priceHistoryTable.customerId, customerId), eq(priceHistoryTable.productId, productId)))
      .orderBy(desc(priceHistoryTable.invoiceDate))
      .limit(10);

    if (history.length === 0) {
      return res.json({ hasHistory: false });
    }

    const [agg] = await db
      .select({
        lowestPrice: sql<string>`MIN(${priceHistoryTable.unitPrice})`,
        highestPrice: sql<string>`MAX(${priceHistoryTable.unitPrice})`,
        avgPrice: sql<string>`AVG(${priceHistoryTable.unitPrice})`,
        totalQuantity: sql<string>`SUM(${priceHistoryTable.quantity})`,
        totalValue: sql<string>`SUM(${priceHistoryTable.finalPrice})`,
        totalProfit: sql<string>`SUM(${priceHistoryTable.profitAmount})`,
        totalOrders: sql<string>`COUNT(*)`,
      })
      .from(priceHistoryTable)
      .where(and(eq(priceHistoryTable.customerId, customerId), eq(priceHistoryTable.productId, productId)));

    const last = history[0];
    const daysSinceLastPurchase = Math.floor((Date.now() - last.invoiceDate.getTime()) / (1000 * 60 * 60 * 24));

    return res.json({
      hasHistory: true,
      lastSellingPrice: parseFloat(last.unitPrice as string),
      lastPurchaseDate: last.invoiceDate.toISOString(),
      lastInvoiceNumber: last.invoiceNumber,
      lastQuantity: parseFloat(last.quantity as string),
      daysSinceLastPurchase,
      previousSales: history.map(fmt),
      lowestPriceEver: round2(parseFloat(agg?.lowestPrice ?? "0")),
      highestPriceEver: round2(parseFloat(agg?.highestPrice ?? "0")),
      averageSellingPrice: round2(parseFloat(agg?.avgPrice ?? "0")),
      totalQuantityPurchased: parseFloat(agg?.totalQuantity ?? "0"),
      totalPurchaseValue: round2(parseFloat(agg?.totalValue ?? "0")),
      totalProfitEarned: round2(parseFloat(agg?.totalProfit ?? "0")),
      totalOrders: Number(agg?.totalOrders ?? 0),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch price history" });
  }
});

/**
 * GET /api/customers/:customerId/price-history
 * Every product this customer has ever bought, with last price + quantity —
 * used for a customer-level "purchase history" list.
 */
router.get("/:customerId/price-history", async (req, res) => {
  try {
    const customerId = parseInt(req.params.customerId);
    const rows = await db.execute(sql`
      SELECT DISTINCT ON (product_id)
        product_id, product_name, sku, unit_price, quantity, invoice_number, invoice_date
      FROM customer_price_history
      WHERE customer_id = ${customerId}
      ORDER BY product_id, invoice_date DESC
    `);
    const items = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];
    return res.json({
      data: items.map((r) => ({
        productId: r.product_id,
        productName: r.product_name,
        sku: r.sku,
        lastUnitPrice: parseFloat(r.unit_price as string),
        lastQuantity: parseFloat(r.quantity as string),
        lastInvoiceNumber: r.invoice_number,
        lastPurchaseDate: r.invoice_date,
      })),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch purchase history" });
  }
});

/**
 * GET /api/customers/:customerId/price-suggestion/:productId?quantity=&proposedPrice=
 * Section 2 — Smart Price Suggestions + warnings, computed from real data
 * (no hard-coded "market price" since this ERP doesn't track a separate
 * market-price feed; that field is included as null with a note so the
 * frontend can hide it or wire it up if one is added later).
 */
router.get("/:customerId/price-suggestion/:productId", async (req, res) => {
  try {
    const customerId = parseInt(req.params.customerId);
    const productId = parseInt(req.params.productId);
    const proposedPrice = req.query.proposedPrice ? parseFloat(req.query.proposedPrice as string) : null;

    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
    if (!product) return res.status(404).json({ error: "Product not found" });

    const [lastPurchase] = await db
      .select()
      .from(priceHistoryTable)
      .where(and(eq(priceHistoryTable.customerId, customerId), eq(priceHistoryTable.productId, productId)))
      .orderBy(desc(priceHistoryTable.invoiceDate))
      .limit(1);

    const costPrice = parseFloat(product.costPrice as string);
    const suggestedSellingPrice = parseFloat(product.salePrice as string);
    const previousCustomerPrice = lastPurchase ? parseFloat(lastPurchase.unitPrice as string) : null;

    // company_settings is a generic key/value(jsonb) table already bootstrapped
    // by init-db.ts. Falls back to a sensible default if unset.
    const settingRows = await db.execute(
      sql`SELECT value FROM company_settings WHERE key = 'minimum_profit_margin_percent' LIMIT 1`,
    );
    const settingResult = (settingRows as unknown as { rows: Array<{ value: unknown }> }).rows ?? [];
    const minimumMarginPercent = settingResult.length ? Number(settingResult[0].value) : 10;

    const evaluatedPrice = proposedPrice ?? suggestedSellingPrice;
    const currentProfit = round2(evaluatedPrice - costPrice);
    const profitPercentage = evaluatedPrice > 0 ? round2((currentProfit / evaluatedPrice) * 100) : 0;

    const warnings: Array<{ level: "error" | "warning"; message: string }> = [];
    if (evaluatedPrice < costPrice) {
      warnings.push({ level: "error", message: `Price is below cost price (Rs. ${costPrice}). This sale will be a loss.` });
    }
    if (previousCustomerPrice !== null && evaluatedPrice < previousCustomerPrice) {
      warnings.push({
        level: "warning",
        message: `Price is lower than this customer's previous price of Rs. ${previousCustomerPrice} (${lastPurchase!.invoiceNumber}).`,
      });
    }
    if (profitPercentage < minimumMarginPercent) {
      warnings.push({
        level: "warning",
        message: `Profit margin (${profitPercentage}%) is below the company minimum of ${minimumMarginPercent}%. Requires manager approval.`,
      });
    }

    return res.json({
      productId,
      costPrice,
      suggestedSellingPrice,
      previousCustomerPrice,
      marketPrice: null, // no market-price feed configured
      currentProfit,
      profitPercentage,
      differenceFromPreviousPrice: previousCustomerPrice !== null ? round2(evaluatedPrice - previousCustomerPrice) : null,
      differenceFromCostPrice: round2(evaluatedPrice - costPrice),
      minimumMarginPercent,
      requiresApproval: profitPercentage < minimumMarginPercent,
      warnings,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to compute price suggestion" });
  }
});

export default router;
