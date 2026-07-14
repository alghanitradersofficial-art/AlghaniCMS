import { pool } from '@workspace/db';

async function queryScalar(client, sql, params = []) {
  const r = await client.query(sql, params);
  const v = r.rows[0];
  if (!v) return 0;
  const val = Object.values(v)[0];
  return val == null ? 0 : Number(val);
}

function toISO(d) { return d.toISOString(); }

async function main() {
  const client = await pool.connect();
  try {
    const year = 2026;
    const month = 7; // July
    const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const periodEnd = new Date(Date.UTC(year, month - 1, 31, 23, 59, 59, 999));

    const totalSales = await queryScalar(client, `SELECT COALESCE(SUM(total::numeric),0) AS v FROM sales WHERE sale_date >= $1 AND sale_date <= $2 AND status = 'completed'`, [periodStart.toISOString(), periodEnd.toISOString()]);
    const totalSalesDiscount = await queryScalar(client, `SELECT COALESCE(SUM(discount::numeric),0) AS v FROM sales WHERE sale_date >= $1 AND sale_date <= $2 AND status = 'completed'`, [periodStart.toISOString(), periodEnd.toISOString()]);
    const totalPurchases = await queryScalar(client, `SELECT COALESCE(SUM(total::numeric),0) AS v FROM purchases WHERE purchase_date >= $1 AND purchase_date <= $2`, [periodStart.toISOString(), periodEnd.toISOString()]);
    const totalExpenses = await queryScalar(client, `SELECT COALESCE(SUM(amount::numeric),0) AS v FROM expenses WHERE created_at >= $1 AND created_at <= $2`, [periodStart.toISOString(), periodEnd.toISOString()]);
    const cashReceived = await queryScalar(client, `SELECT COALESCE(SUM(amount::numeric),0) AS v FROM payments WHERE payment_date >= $1 AND payment_date <= $2`, [periodStart.toISOString(), periodEnd.toISOString()]);
    const supplierPayments = await queryScalar(client, `SELECT COALESCE(SUM(amount::numeric),0) AS v FROM supplier_payments WHERE payment_date >= $1 AND payment_date <= $2`, [periodStart.toISOString(), periodEnd.toISOString()]);
    const closingStockValue = await queryScalar(client, `SELECT COALESCE(SUM(current_stock::numeric * cost_price::numeric), 0) AS v FROM products`);
    const closingStockQuantity = await queryScalar(client, `SELECT COALESCE(SUM(current_stock::numeric), 0) AS v FROM products`);
    const customerOutstanding = await queryScalar(client, `SELECT COALESCE(SUM((total::numeric - amount_paid::numeric)),0) AS v FROM sales WHERE sale_date <= $1 AND status = 'completed'`, [periodEnd.toISOString()]);
    const supplierOutstanding = await queryScalar(client, `SELECT COALESCE(SUM((total::numeric - amount_paid::numeric)),0) AS v FROM purchases WHERE purchase_date <= $1`, [periodEnd.toISOString()]);

    const netSales = totalSales - totalSalesDiscount;
    const grossProfit = netSales - totalPurchases;
    const netProfit = grossProfit - totalExpenses;

    // minimal warnings
    const negativeStockCount = await queryScalar(client, `SELECT COALESCE(COUNT(*),0) AS v FROM products WHERE current_stock < 0`);
    const warnings = [];
    if (negativeStockCount > 0) warnings.push('Negative stock detected');

    // Insert period and closure in a transaction
    await client.query('BEGIN');
    const periodRes = await client.query(`INSERT INTO financial_periods (year, month, status, opening_cash, opening_stock_value, opening_customer_balance, opening_supplier_balance, closing_cash, closing_stock_value, closing_customer_balance, closing_supplier_balance, closed_at, closed_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`, [
      year, month, 'closed', 0, 0, 0, 0, (cashReceived - (supplierPayments + totalExpenses)).toFixed(2), closingStockValue.toFixed(2), customerOutstanding.toFixed(2), supplierOutstanding.toFixed(2), new Date().toISOString(), 38
    ]);
    const periodId = periodRes.rows[0].id;

    const closureRes = await client.query(`INSERT INTO month_closures (year, month, period_start, period_end, total_sales, total_purchases, total_expenses, cash_in_hand, closing_stock_value, customer_outstanding, supplier_outstanding, created_by_user_id, is_locked) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`, [
      year, month, periodStart.toISOString(), periodEnd.toISOString(), totalSales.toFixed(2), totalPurchases.toFixed(2), totalExpenses.toFixed(2), (cashReceived - (supplierPayments + totalExpenses)).toFixed(2), closingStockValue.toFixed(2), customerOutstanding.toFixed(2), supplierOutstanding.toFixed(2), 38, true
    ]);

    await client.query(`INSERT INTO financial_period_snapshots (period_id, snapshot_type, summary, sales_summary, purchase_summary, profit_summary, inventory_summary, customer_summary, supplier_summary, cash_summary, top_products, top_customers, top_suppliers, kpi_summary) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [
      periodId,
      'monthly',
      JSON.stringify({ year, month, status: 'closed', warnings, closedAt: new Date().toISOString() }),
      JSON.stringify({ totalSales, discounts: totalSalesDiscount, netSales }),
      JSON.stringify({ totalPurchases }),
      JSON.stringify({ grossProfit, totalExpenses, netProfit }),
      JSON.stringify({ closingStock: closingStockQuantity, closingStockValue }),
      JSON.stringify({ totalCustomerReceivables: customerOutstanding }),
      JSON.stringify({ totalSupplierPayables: supplierOutstanding }),
      JSON.stringify({ cashReceived }),
      JSON.stringify([]), JSON.stringify([]), JSON.stringify([]), JSON.stringify({ netProfit, closingStockValue, totalCustomerReceivables: customerOutstanding })
    ]);

    await client.query(`INSERT INTO financial_period_balances (period_id, balance_type, opening_balance, closing_balance, notes, is_carry_forward) VALUES ($1,$2,$3,$4,$5,$6), ($1,$7,$8,$9,$10,$11), ($1,$12,$13,$14,$15,$16), ($1,$17,$18,$19,$20,$21)`, [
      periodId,
      'cash', 0, (cashReceived - (supplierPayments + totalExpenses)).toFixed(2), 'Carry forward from previous period', true,
      'stock', 0, closingStockValue.toFixed(2), 'Inventory balance', false,
      'customer', 0, customerOutstanding.toFixed(2), 'Customer receivables', false,
      'supplier', 0, supplierOutstanding.toFixed(2), 'Supplier payables', false,
    ]);

    await client.query(`INSERT INTO financial_period_audit_logs (period_id, entity_type, action, old_value, new_value, reason, performed_by_user_id, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
      periodId, 'month_closure', 'close', null, JSON.stringify({ totalSales, totalPurchases, totalExpenses }), `Month closed for ${year}-${month}`, 38, JSON.stringify({ warnings })
    ]);

    await client.query('COMMIT');
    console.log('Month closed for', year, month);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
