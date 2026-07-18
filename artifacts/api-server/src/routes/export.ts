import { Router } from "express";
import { pool } from "@workspace/db";
import ExcelJS from "exceljs";
import { buildFinancialReportSummary } from "../lib/reporting-engine.js";

const router = Router();

async function getCompanySettings() {
  try {
    const result = await pool.query(`SELECT key, value FROM company_settings`);
    const settings: Record<string, unknown> = {};
    for (const row of result.rows) settings[row.key] = row.value;
    return {
      company: (settings.company as Record<string, string>) || {
        name: "Company Name",
        address: "Company Address",
        phone: "",
        email: "",
        branch: "Main Branch",
        ceoName: "",
        ntn: "",
      },
    };
  } catch {
    return {
      company: {
        name: "Company Name",
        address: "Company Address",
        phone: "",
        email: "",
        branch: "Main Branch",
        ceoName: "",
        ntn: "",
      },
    };
  }
}

function addExcelBranding(ws: ExcelJS.Worksheet, company: Record<string, string>, title: string, cols: number) {
  ws.mergeCells(1, 1, 1, cols);
  const titleCell = ws.getCell("A1");
  titleCell.value = company.name || "Al Ghani Wholesale Traders";
  titleCell.font = { bold: true, size: 16, color: { argb: "FFDC2626" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1a1a1a" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, cols);
  const subCell = ws.getCell("A2");
  subCell.value = `${company.branch || ""}  |  ${company.address || ""}  |  ${company.phone || ""}`;
  subCell.font = { size: 9, color: { argb: "FFD97706" } };
  subCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1a1a1a" } };
  subCell.alignment = { horizontal: "center" };
  ws.getRow(2).height = 18;

  ws.mergeCells(3, 1, 3, cols);
  const reportCell = ws.getCell("A3");
  reportCell.value = `${title}  —  Generated: ${new Date().toLocaleString("en-PK")}`;
  reportCell.font = { size: 9, color: { argb: "FF999999" } };
  reportCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111111" } };
  reportCell.alignment = { horizontal: "center" };
  ws.getRow(3).height = 16;
}

function styleExcelHeader(ws: ExcelJS.Worksheet, row: number, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = ws.getCell(row, c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDC2626" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFD97706" } } };
  }
  ws.getRow(row).height = 22;
}

function formatCurrencyCell(cell: ExcelJS.Cell) {
  if (!cell) return;
  cell.numFmt = '"Rs." #,##0.00;[Red]"Rs." -#,##0.00';
}

function formatPercentCell(cell: ExcelJS.Cell) {
  if (!cell) return;
  cell.numFmt = "0.00%";
}

function resolveReportRangeQuery(query: Record<string, unknown>) {
  return {
    preset: (query.range as string) || "all",
    from: query.from as string | undefined,
    to: query.to as string | undefined,
  };
}

async function addDashboardSheet(wb: ExcelJS.Workbook, company: Record<string, string>, rangeQuery: { preset: string; from?: string; to?: string }) {
  // Fetch all dashboard metrics
  const params: any[] = [];
  const clauses: Record<string, string[]> = { sales: [], purchases: [], expenses: [] };
  if (rangeQuery.from) {
    params.push(rangeQuery.from);
    clauses.sales.push(`created_at::date >= $${params.length}`);
    clauses.purchases.push(`created_at::date >= $${params.length}`);
    clauses.expenses.push(`created_at::date >= $${params.length}`);
  }
  if (rangeQuery.to) {
    params.push(rangeQuery.to);
    clauses.sales.push(`created_at::date <= $${params.length}`);
    clauses.purchases.push(`created_at::date <= $${params.length}`);
    clauses.expenses.push(`created_at::date <= $${params.length}`);
  }
  const salesClause = clauses.sales.length ? `WHERE ${clauses.sales.join(" AND ")}` : "";
  const purchasesClause = clauses.purchases.length ? `WHERE ${clauses.purchases.join(" AND ")}` : "";
  const expensesClause = clauses.expenses.length ? `WHERE ${clauses.expenses.join(" AND ")}` : "";

  const [sRes, pRes, eRes, prodRes, custRes, supRes, payRes, lowStockRes] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(total::numeric), 0) as total, COUNT(*) as count 
       FROM sales WHERE status = 'completed' ${clauses.sales.length ? `AND ${clauses.sales.join(" AND ")}` : ""}`,
      clauses.sales.length ? params : []
    ),
    pool.query(
      `SELECT COALESCE(SUM(total::numeric), 0) as total, COUNT(*) as count 
       FROM purchases WHERE status = 'received' ${clauses.purchases.length ? `AND ${clauses.purchases.join(" AND ")}` : ""}`,
      clauses.purchases.length ? params : []
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount::numeric), 0) as total, COUNT(*) as count 
       FROM expenses ${clauses.expenses.length ? `WHERE ${clauses.expenses.join(" AND ")}` : ""}`,
      clauses.expenses.length ? params : []
    ),
    pool.query(`SELECT COUNT(*) as total, SUM(CASE WHEN current_stock <= min_stock THEN 1 ELSE 0 END) as low_stock, COALESCE(SUM(current_stock::numeric), 0) as total_stock, COALESCE(SUM(cost_price::numeric * current_stock::numeric), 0) as inventory_value FROM products`),
    pool.query(`SELECT COUNT(*) as total FROM customers`),
    pool.query(`SELECT COUNT(*) as total FROM suppliers`),
    pool.query(`SELECT COALESCE(SUM(amount::numeric), 0) as total FROM payments WHERE is_voided = false`),
    pool.query(`SELECT COUNT(*) as total FROM products WHERE current_stock <= min_stock`),
  ]);

  const totalSalesRevenue = parseFloat(sRes.rows[0]?.total ?? 0);
  const totalSalesOrders = parseInt(sRes.rows[0]?.count ?? 0, 10);
  const totalCogs = parseFloat(pRes.rows[0]?.total ?? 0);
  const totalExpenses = parseFloat(eRes.rows[0]?.total ?? 0);
  const grossProfit = totalSalesRevenue - totalCogs;
  const netProfit = grossProfit - totalExpenses;
  const totalProducts = parseInt(prodRes.rows[0]?.total ?? 0, 10);
  const lowStockProducts = parseInt(prodRes.rows[0]?.low_stock ?? 0, 10);
  const totalInventoryValue = parseFloat(prodRes.rows[0]?.inventory_value ?? 0);
  const totalInventoryQty = parseInt(prodRes.rows[0]?.total_stock ?? 0, 10);
  const totalCustomers = parseInt(custRes.rows[0]?.total ?? 0, 10);
  const totalSuppliers = parseInt(supRes.rows[0]?.total ?? 0, 10);
  const totalPayments = parseFloat(payRes.rows[0]?.total ?? 0);
  const totalLowStock = parseInt(lowStockRes.rows[0]?.total ?? 0, 10);

  const ws = wb.addWorksheet("Dashboard");
  addExcelBranding(ws, company, "Dashboard Summary", 2);
  ws.columns = [{ key: "metric", width: 40 }, { key: "value", width: 26 }];
  ws.addRow(["Metric", "Value"]);
  styleExcelHeader(ws, 4, 2);

  const dashboardData = [
    ["📅 Report Period", new Date().toLocaleString("en-PK")],
    ["", ""],
    ["💰 Financial Summary", ""],
    ["Total Sales Revenue", totalSalesRevenue],
    ["Total COGS (Purchases)", totalCogs],
    ["Gross Profit", grossProfit],
    ["Total Expenses", totalExpenses],
    ["Net Profit", netProfit],
    ["Gross Margin %", `${((grossProfit / totalSalesRevenue) * 100).toFixed(2)}%`],
    ["Net Margin %", `${((netProfit / totalSalesRevenue) * 100).toFixed(2)}%`],
    ["", ""],
    ["📊 Operations", ""],
    ["Total Sales Orders", totalSalesOrders],
    ["Total Payments Received", totalPayments],
    ["", ""],
    ["📦 Inventory Status", ""],
    ["Total Products", totalProducts],
    ["Total Inventory Value", totalInventoryValue],
    ["Total Inventory Quantity", totalInventoryQty],
    ["Low Stock Items", lowStockProducts],
    ["Available Stock Count", Math.max(totalInventoryQty - lowStockProducts, 0)],
    ["", ""],
    ["👥 People", ""],
    ["Total Customers", totalCustomers],
    ["Total Suppliers", totalSuppliers],
  ];

  for (const row of dashboardData) {
    if (row[0] === "") {
      ws.addRow(["", ""]);
    } else {
      const excelRow = ws.addRow(row);
      if (typeof row[1] === "number") {
        formatCurrencyCell(excelRow.getCell(2));
        excelRow.getCell(2).alignment = { horizontal: "right" };
      } else if (excelRow.getCell(2).value?.toString().includes("%")) {
        excelRow.getCell(2).alignment = { horizontal: "right" };
      }
      excelRow.getCell(1).alignment = { horizontal: "left" };
      const metricName = String(row[0]);
      if (metricName.includes("Summary") || metricName.includes("Operations") || metricName.includes("Inventory") || metricName.includes("People")) {
        excelRow.getCell(1).font = { bold: true, size: 11, color: { argb: "FFDC2626" } };
      }
    }
  }
}

async function addReportSummarySheet(wb: ExcelJS.Workbook, company: Record<string, string>, rangeQuery: { preset: string; from?: string; to?: string }) {
  const summary = await buildFinancialReportSummary(pool, {
    preset: rangeQuery.preset as any,
    from: rangeQuery.from,
    to: rangeQuery.to,
  });

  const lowStockRes = await pool.query(`SELECT COUNT(*) AS low_stock FROM products WHERE current_stock <= min_stock`);
  const lowStock = parseInt(lowStockRes.rows[0]?.low_stock ?? "0", 10);

  const ws = wb.addWorksheet("Summary");
  addExcelBranding(ws, company, "Report Summary", 2);
  ws.columns = [{ key: "metric", width: 36 }, { key: "value", width: 26 }];
  ws.addRow(["Metric", "Value"]);
  styleExcelHeader(ws, 4, 2);

  const rows = [
    ["Report period", summary.label],
    ["Generated on", new Date().toLocaleString("en-PK")],
    ["Revenue", summary.current.revenue],
    ["Cost of goods sold", summary.current.cogs],
    ["Gross profit", summary.current.grossProfit],
    ["Expenses", summary.current.expenses],
    ["Net profit", summary.current.netProfit],
    ["Gross margin", `${summary.current.grossMargin.toFixed(2)}%`],
    ["Net margin", `${summary.current.netMargin.toFixed(2)}%`],
    ["Inventory value", summary.current.inventoryValue],
    ["Inventory quantity", summary.current.inventoryQuantity],
    ["Total products", summary.current.totalProducts],
    ["Customers", summary.current.customers],
    ["Suppliers", summary.current.suppliers],
    ["Sales orders", summary.current.salesCount],
    ["Invoices", summary.current.invoices],
    ["Low stock products", lowStock],
  ];

  for (const row of rows) {
    const excelRow = ws.addRow(row);
    if (typeof row[1] === "number") {
      formatCurrencyCell(excelRow.getCell(2));
    }
    excelRow.getCell(1).alignment = { horizontal: "left" };
    excelRow.getCell(2).alignment = { horizontal: typeof row[1] === "number" ? "right" : "left" };
  }
}

async function addCustomerLedgerSheet(wb: ExcelJS.Workbook, company: Record<string, string>) {
  const result = await pool.query(`
    SELECT c.name,
      COALESCE(last.running_balance, c.opening_balance) AS balance,
      COALESCE(sales.total_outstanding, 0) AS outstanding,
      COALESCE(payments.total_payments, 0) AS total_payments,
      COALESCE(sales.total_sales, 0) AS total_sales,
      COALESCE(sales.pending_invoices, 0) AS pending_invoices,
      COALESCE(c.credit_limit::numeric, 0) AS credit_limit,
      GREATEST(COALESCE(c.credit_limit::numeric, 0) - GREATEST(COALESCE(last.running_balance, c.opening_balance), 0), 0) AS available_credit
    FROM customers c
    LEFT JOIN LATERAL (
      SELECT running_balance
      FROM customer_ledger_entries
      WHERE customer_id = c.id
      ORDER BY id DESC
      LIMIT 1
    ) last ON true
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(total::numeric), 0) AS total_sales,
        COALESCE(SUM(total::numeric - amount_paid::numeric), 0) AS total_outstanding,
        COUNT(*) FILTER (WHERE total::numeric - amount_paid::numeric > 0.005) AS pending_invoices
      FROM sales
      WHERE customer_id = c.id AND status = 'completed'
    ) sales ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(amount::numeric), 0) AS total_payments
      FROM payments
      WHERE customer_id = c.id AND is_voided = false
    ) payments ON true
    ORDER BY outstanding DESC, c.name
  `);

  const ws = wb.addWorksheet("Customer Ledger");
  addExcelBranding(ws, company, "Customer Ledger", 8);
  ws.columns = [
    { key: "customer", width: 30 },
    { key: "balance", width: 16 },
    { key: "outstanding", width: 16 },
    { key: "payments", width: 16 },
    { key: "sales", width: 16 },
    { key: "pending", width: 14 },
    { key: "creditLimit", width: 16 },
    { key: "availableCredit", width: 18 },
  ];
  ws.addRow(["Customer", "Balance", "Outstanding", "Payments", "Sales", "Pending invoices", "Credit limit", "Available credit"]);
  styleExcelHeader(ws, 4, 8);

  let totals = { balance: 0, outstanding: 0, totalPayments: 0, totalSales: 0, creditLimit: 0, availableCredit: 0 };
  for (const row of result.rows as any[]) {
    const excelRow = ws.addRow([
      row.name,
      parseFloat(row.balance ?? 0),
      parseFloat(row.outstanding ?? 0),
      parseFloat(row.total_payments ?? 0),
      parseFloat(row.total_sales ?? 0),
      Number(row.pending_invoices ?? 0),
      parseFloat(row.credit_limit ?? 0),
      parseFloat(row.available_credit ?? 0),
    ]);
    formatCurrencyCell(excelRow.getCell(2));
    formatCurrencyCell(excelRow.getCell(3));
    formatCurrencyCell(excelRow.getCell(4));
    formatCurrencyCell(excelRow.getCell(5));
    formatCurrencyCell(excelRow.getCell(7));
    formatCurrencyCell(excelRow.getCell(8));
    totals.balance += parseFloat(row.balance ?? 0);
    totals.outstanding += parseFloat(row.outstanding ?? 0);
    totals.totalPayments += parseFloat(row.total_payments ?? 0);
    totals.totalSales += parseFloat(row.total_sales ?? 0);
    totals.creditLimit += parseFloat(row.credit_limit ?? 0);
    totals.availableCredit += parseFloat(row.available_credit ?? 0);
  }

  const totalRow = ws.addRow([
    "TOTAL",
    totals.balance,
    totals.outstanding,
    totals.totalPayments,
    totals.totalSales,
    undefined,
    totals.creditLimit,
    totals.availableCredit,
  ]);
  totalRow.font = { bold: true };
  formatCurrencyCell(totalRow.getCell(2));
  formatCurrencyCell(totalRow.getCell(3));
  formatCurrencyCell(totalRow.getCell(4));
  formatCurrencyCell(totalRow.getCell(5));
  formatCurrencyCell(totalRow.getCell(7));
  formatCurrencyCell(totalRow.getCell(8));
}

async function addSupplierLedgerSheet(wb: ExcelJS.Workbook, company: Record<string, string>) {
  const result = await pool.query(`
    SELECT s.name,
      COALESCE(last.running_balance, s.opening_balance) AS balance,
      COALESCE(purchaseAgg.total_purchases, 0) AS total_purchases,
      COALESCE(purchaseAgg.total_outstanding, 0) AS outstanding,
      COALESCE(payAgg.total_payments, 0) AS total_payments
    FROM suppliers s
    LEFT JOIN LATERAL (
      SELECT running_balance
      FROM supplier_ledger_entries
      WHERE supplier_id = s.id
      ORDER BY id DESC
      LIMIT 1
    ) last ON true
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(total::numeric), 0) AS total_purchases,
        COALESCE(SUM(total::numeric - amount_paid::numeric), 0) AS total_outstanding
      FROM purchases
      WHERE supplier_id = s.id AND status = 'received'
    ) purchaseAgg ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(amount::numeric), 0) AS total_payments
      FROM supplier_payments
      WHERE supplier_id = s.id AND is_voided = false
    ) payAgg ON true
    ORDER BY outstanding DESC, s.name
  `);

  const ws = wb.addWorksheet("Supplier Ledger");
  addExcelBranding(ws, company, "Supplier Ledger", 5);
  ws.columns = [
    { key: "supplier", width: 32 },
    { key: "balance", width: 16 },
    { key: "purchases", width: 16 },
    { key: "outstanding", width: 18 },
    { key: "payments", width: 16 },
  ];
  ws.addRow(["Supplier", "Balance", "Purchases", "Outstanding", "Payments"]);
  styleExcelHeader(ws, 4, 5);

  let totals = { balance: 0, totalPurchases: 0, outstanding: 0, totalPayments: 0 };
  for (const row of result.rows as any[]) {
    const excelRow = ws.addRow([
      row.name,
      parseFloat(row.balance ?? 0),
      parseFloat(row.total_purchases ?? 0),
      parseFloat(row.outstanding ?? 0),
      parseFloat(row.total_payments ?? 0),
    ]);
    formatCurrencyCell(excelRow.getCell(2));
    formatCurrencyCell(excelRow.getCell(3));
    formatCurrencyCell(excelRow.getCell(4));
    formatCurrencyCell(excelRow.getCell(5));
    totals.balance += parseFloat(row.balance ?? 0);
    totals.totalPurchases += parseFloat(row.total_purchases ?? 0);
    totals.outstanding += parseFloat(row.outstanding ?? 0);
    totals.totalPayments += parseFloat(row.total_payments ?? 0);
  }

  const totalRow = ws.addRow([
    "TOTAL",
    totals.balance,
    totals.totalPurchases,
    totals.outstanding,
    totals.totalPayments,
  ]);
  totalRow.font = { bold: true };
  formatCurrencyCell(totalRow.getCell(2));
  formatCurrencyCell(totalRow.getCell(3));
  formatCurrencyCell(totalRow.getCell(4));
  formatCurrencyCell(totalRow.getCell(5));
}

export async function buildFullReportWorkbook(rangeQuery: { preset: string; from?: string; to?: string }) {
  const { company } = await getCompanySettings();
  const wb = new ExcelJS.Workbook();
  wb.creator = company.name;
  await addDashboardSheet(wb, company, rangeQuery);
  await addReportSummarySheet(wb, company, rangeQuery);
  await addCustomerLedgerSheet(wb, company);
  await addSupplierLedgerSheet(wb, company);
  return wb;
}

// ─── SALES EXPORT ────────────────────────────────────────────────────────────
router.get("/sales/excel", async (req, res) => {
  try {
    const { company } = await getCompanySettings();
    const result = await pool.query(`SELECT * FROM sales ORDER BY created_at DESC`);
    const wb = new ExcelJS.Workbook();
    wb.creator = company.name;
    const ws = wb.addWorksheet("Sales Report");
    const cols = 7;
    addExcelBranding(ws, company, "Sales Report", cols);
    ws.columns = [
      { key: "invoice", width: 16 }, { key: "customer", width: 28 },
      { key: "date", width: 16 }, { key: "status", width: 14 },
      { key: "subtotal", width: 16 }, { key: "discount", width: 14 }, { key: "total", width: 16 },
    ];
    ws.addRow(["Invoice #", "Customer", "Date", "Status", "Subtotal", "Discount", "Total"]);
    styleExcelHeader(ws, 4, cols);
    let grandTotal = 0;
    for (const row of result.rows) {
      const r = ws.addRow({
        invoice: row.invoice_number, customer: row.customer_name,
        date: new Date(row.created_at).toLocaleDateString("en-PK"),
        status: row.status, subtotal: parseFloat(row.subtotal),
        discount: parseFloat(row.discount || "0"), total: parseFloat(row.total),
      });
      r.getCell(4).font = { color: { argb: row.status === "completed" ? "FF22c55e" : row.status === "pending" ? "FFD97706" : "FFef4444" } };
      r.getCell(7).font = { bold: true, color: { argb: "FFD97706" } };
      grandTotal += parseFloat(row.total);
    }
    const totalRow = ws.addRow(["", "", "", "GRAND TOTAL", "", "", grandTotal]);
    totalRow.font = { bold: true, color: { argb: "FFDC2626" } };
    totalRow.getCell(7).font = { bold: true, color: { argb: "FFD97706" } };
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="sales-report.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    try {
      console.error("Export route error:", (error as any)?.stack || JSON.stringify(error));
    } catch (e) {
      console.error("Export route error (unknown):", error);
    }
    return res.status(500).json({ error: "Failed to export Excel" });
  }
});

// ─── PURCHASES EXPORT ────────────────────────────────────────────────────────
router.get("/purchases/excel", async (req, res) => {
  try {
    const { company } = await getCompanySettings();
    const result = await pool.query(`SELECT * FROM purchases ORDER BY created_at DESC`);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Purchases Report");
    const cols = 6;
    addExcelBranding(ws, company, "Purchases Report", cols);
    ws.columns = [
      { key: "po", width: 18 }, { key: "supplier", width: 28 },
      { key: "date", width: 16 }, { key: "status", width: 14 },
      { key: "subtotal", width: 16 }, { key: "total", width: 16 },
    ];
    ws.addRow(["PO Number", "Supplier", "Date", "Status", "Subtotal", "Total"]);
    styleExcelHeader(ws, 4, cols);
    let grandTotal = 0;
    for (const row of result.rows) {
      const r = ws.addRow({
        po: row.po_number, supplier: row.supplier_name,
        date: new Date(row.created_at).toLocaleDateString("en-PK"),
        status: row.status, subtotal: parseFloat(row.subtotal), total: parseFloat(row.total),
      });
      r.getCell(4).font = { color: { argb: row.status === "received" ? "FF22c55e" : row.status === "pending" ? "FFD97706" : "FFef4444" } };
      r.getCell(6).font = { bold: true, color: { argb: "FFD97706" } };
      grandTotal += parseFloat(row.total);
    }
    const totalRow = ws.addRow(["", "", "", "GRAND TOTAL", "", grandTotal]);
    totalRow.font = { bold: true, color: { argb: "FFDC2626" } };
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="purchases-report.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    return res.status(500).json({ error: "Failed to export Excel" });
  }
});

// ─── INVENTORY EXPORT ────────────────────────────────────────────────────────
router.get("/inventory/excel", async (req, res) => {
  try {
    const { company } = await getCompanySettings();
    const result = await pool.query(`
      SELECT p.*, c.name as cat_name, b.name as brand_name
      FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN brands b ON b.id = p.brand_id
      ORDER BY p.name
    `);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Inventory");
    const cols = 8;
    addExcelBranding(ws, company, "Inventory Report", cols);
    ws.columns = [
      { key: "id", width: 12 }, { key: "name", width: 30 }, { key: "cat", width: 16 },
      { key: "brand", width: 14 }, { key: "cost", width: 14 },
      { key: "stock", width: 12 }, { key: "min", width: 12 }, { key: "value", width: 16 },
    ];
    ws.addRow(["Product ID", "Product Name", "Category", "Brand", "Cost Price", "Stock", "Min Stock", "Value"]);
    styleExcelHeader(ws, 4, cols);
    let totalValue = 0;
    for (const row of result.rows) {
      const val = parseFloat(row.cost_price) * parseInt(row.current_stock);
      const r = ws.addRow({
        id: row.id, name: row.name, cat: row.cat_name, brand: row.brand_name,
        cost: parseFloat(row.cost_price),
        stock: parseInt(row.current_stock), min: parseInt(row.min_stock), value: val,
      });
      if (parseInt(row.current_stock) <= parseInt(row.min_stock)) {
        r.getCell(6).font = { color: { argb: "FFef4444" }, bold: true };
      }
      r.getCell(8).font = { bold: true, color: { argb: "FFD97706" } };
      totalValue += val;
    }
    const totalRow = ws.addRow(["", "", "", "", "", "", "TOTAL VALUE", totalValue]);
    totalRow.font = { bold: true, color: { argb: "FFDC2626" } };
    totalRow.getCell(8).font = { bold: true, color: { argb: "FFD97706" } };
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="inventory-report.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    return res.status(500).json({ error: "Failed to export Excel" });
  }
});

// ─── EXPENSES EXPORT ─────────────────────────────────────────────────────────
router.get("/expenses/excel", async (req, res) => {
  try {
    const { company } = await getCompanySettings();
    const result = await pool.query(`SELECT * FROM expenses ORDER BY created_at DESC`);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Expenses");
    const cols = 4;
    addExcelBranding(ws, company, "Expenses Report", cols);
    ws.columns = [{ key: "title", width: 30 }, { key: "cat", width: 20 }, { key: "date", width: 16 }, { key: "amount", width: 16 }];
    ws.addRow(["Title", "Category", "Date", "Amount"]);
    styleExcelHeader(ws, 4, cols);
    let total = 0;
    for (const row of result.rows) {
      const r = ws.addRow({ title: row.title, cat: row.category || "General", date: new Date(row.created_at).toLocaleDateString("en-PK"), amount: parseFloat(row.amount) });
      r.getCell(4).font = { color: { argb: "FFDC2626" } };
      total += parseFloat(row.amount);
    }
    const tr = ws.addRow(["", "", "TOTAL", total]);
    tr.font = { bold: true, color: { argb: "FFDC2626" } };
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="expenses-report.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    return res.status(500).json({ error: "Failed to export Excel" });
  }
});

// ─── FULL REPORT EXPORT ───────────────────────────────────────────────────────
router.get("/report/excel", async (req, res) => {
  try {
    const { company } = await getCompanySettings();
    const rangeQuery = resolveReportRangeQuery(req.query as Record<string, unknown>);
    const salesWhere = [] as string[];
    const purchaseWhere = [] as string[];
    const expenseWhere = [] as string[];
    const params: any[] = [];

    if (rangeQuery.from) {
      params.push(rangeQuery.from);
      salesWhere.push(`created_at::date >= $${params.length}`);
      purchaseWhere.push(`created_at::date >= $${params.length}`);
      expenseWhere.push(`created_at::date >= $${params.length}`);
    }
    if (rangeQuery.to) {
      params.push(rangeQuery.to);
      salesWhere.push(`created_at::date <= $${params.length}`);
      purchaseWhere.push(`created_at::date <= $${params.length}`);
      expenseWhere.push(`created_at::date <= $${params.length}`);
    }

    const salesFilter = salesWhere.length ? `WHERE ${salesWhere.join(" AND ")}` : "";
    const purchaseFilter = purchaseWhere.length ? `WHERE ${purchaseWhere.join(" AND ")}` : "";
    const expenseFilter = expenseWhere.length ? `WHERE ${expenseWhere.join(" AND ")}` : "";

    const [sRes, pRes, eRes] = await Promise.all([
      pool.query(`SELECT * FROM sales ${salesFilter} ORDER BY created_at DESC`, params),
      pool.query(`SELECT * FROM purchases ${purchaseFilter} ORDER BY created_at DESC`, params),
      pool.query(`SELECT * FROM expenses ${expenseFilter} ORDER BY created_at DESC`, params),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = company.name;

    await addDashboardSheet(wb, company, rangeQuery);
    await addReportSummarySheet(wb, company, rangeQuery);
    await addCustomerLedgerSheet(wb, company);
    await addSupplierLedgerSheet(wb, company);

    // Sales sheet
    const ws1 = wb.addWorksheet("Sales");
    addExcelBranding(ws1, company, "Sales Report", 5);
    ws1.columns = [{ key: "inv", width: 16 }, { key: "cust", width: 28 }, { key: "date", width: 16 }, { key: "status", width: 14 }, { key: "total", width: 16 }];
    ws1.addRow(["Invoice", "Customer", "Date", "Status", "Total"]);
    styleExcelHeader(ws1, 4, 5);
    let salesTotal = 0;
    for (const r of sRes.rows) {
      const row = ws1.addRow({ inv: r.invoice_number, cust: r.customer_name, date: new Date(r.created_at).toLocaleDateString("en-PK"), status: r.status, total: parseFloat(r.total) });
      row.getCell(5).numFmt = '"Rs." #,##0.00;[Red]"Rs." -#,##0.00';
      salesTotal += parseFloat(r.total);
    }
    const salesTotalRow = ws1.addRow(["", "", "", "Sales Total", salesTotal]);
    salesTotalRow.font = { bold: true, color: { argb: "FFDC2626" } };
    formatCurrencyCell(salesTotalRow.getCell(5));

    // Purchases sheet
    const ws2 = wb.addWorksheet("Purchases");
    addExcelBranding(ws2, company, "Purchases Report", 5);
    ws2.columns = [{ key: "po", width: 16 }, { key: "sup", width: 28 }, { key: "date", width: 16 }, { key: "status", width: 14 }, { key: "total", width: 16 }];
    ws2.addRow(["PO #", "Supplier", "Date", "Status", "Total"]);
    styleExcelHeader(ws2, 4, 5);
    let purchaseTotal = 0;
    for (const r of pRes.rows) {
      const row = ws2.addRow({ po: r.po_number, sup: r.supplier_name, date: new Date(r.created_at).toLocaleDateString("en-PK"), status: r.status, total: parseFloat(r.total) });
      row.getCell(5).numFmt = '"Rs." #,##0.00;[Red]"Rs." -#,##0.00';
      purchaseTotal += parseFloat(r.total);
    }
    const purchaseTotalRow = ws2.addRow(["", "", "", "Purchases Total", purchaseTotal]);
    purchaseTotalRow.font = { bold: true, color: { argb: "FFDC2626" } };
    formatCurrencyCell(purchaseTotalRow.getCell(5));

    // Expenses sheet
    const ws3 = wb.addWorksheet("Expenses");
    addExcelBranding(ws3, company, "Expenses Report", 4);
    ws3.columns = [{ key: "title", width: 30 }, { key: "cat", width: 20 }, { key: "date", width: 16 }, { key: "amount", width: 16 }];
    ws3.addRow(["Title", "Category", "Date", "Amount"]);
    styleExcelHeader(ws3, 4, 4);
    let expenseTotal = 0;
    for (const r of eRes.rows) {
      const row = ws3.addRow({ title: r.title, cat: r.category || "General", date: new Date(r.created_at).toLocaleDateString("en-PK"), amount: parseFloat(r.amount) });
      row.getCell(4).numFmt = '"Rs." #,##0.00;[Red]"Rs." -#,##0.00';
      expenseTotal += parseFloat(r.amount);
    }
    const expenseTotalRow = ws3.addRow(["", "", "Expenses Total", expenseTotal]);
    expenseTotalRow.font = { bold: true, color: { argb: "FFDC2626" } };
    formatCurrencyCell(expenseTotalRow.getCell(4));

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="full-report.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to export Excel" });
  }
});

export default router;

// --- Debug helper: build workbook and return sheet names or error ---
router.get('/debug/build-wb', async (_req, res) => {
  try {
    const wb = await buildFullReportWorkbook({ preset: 'all' });
    return res.json({ sheets: wb.worksheets.map(ws => ws.name) });
  } catch (err) {
    try { console.error('buildFullReportWorkbook failed:', (err as any)?.stack || JSON.stringify(err)); } catch (e) { console.error('buildFullReportWorkbook failed (unknown):', err); }
    return res.status(500).json({ error: 'build failed', detail: (err as any)?.message || String(err) });
  }
});

