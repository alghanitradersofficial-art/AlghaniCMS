import { Router } from 'express';
import { db, sales, purchases, expenses, customers, suppliers, customerLedger, supplierLedger, saleItems, purchaseItems, monthClosures } from '@workspace/db';
import { sql, gte, lte, and, eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { authMiddleware } from '../lib/auth.js';
import { sendMonthlyReport } from '../lib/email.js';
import { sendTelegramDocument, sendTelegramMessage } from '../lib/telegram.js';
import os from 'os';
import path from 'path';
import fs from 'fs';

const router = Router();
router.use(authMiddleware);
function toNum(v: any) { return Number(v) || 0; }

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// GET /api/reports/profit-loss
router.get('/profit-loss', async (req, res) => {
  try {
    const { period = 'monthly', year, month } = req.query;
    let start: Date, end: Date;
    const now = new Date();

    if (period === 'monthly') {
      const y = Number(year) || now.getFullYear();
      const m = Number(month) || now.getMonth() + 1;
      start = new Date(y, m - 1, 1);
      end = new Date(y, m, 0, 23, 59, 59);
    } else if (period === 'yearly') {
      const y = Number(year) || now.getFullYear();
      start = new Date(y, 0, 1);
      end = new Date(y, 11, 31, 23, 59, 59);
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = now;
    }

    const [s] = await db.select({ total: sql<number>`COALESCE(SUM(CAST(total AS NUMERIC)), 0)` }).from(sales).where(and(gte(sales.saleDate, start), lte(sales.saleDate, end)));
    const [p] = await db.select({ total: sql<number>`COALESCE(SUM(CAST(total AS NUMERIC)), 0)` }).from(purchases).where(and(gte(purchases.purchaseDate, start), lte(purchases.purchaseDate, end)));
    const [e] = await db.select({ total: sql<number>`COALESCE(SUM(CAST(amount AS NUMERIC)), 0)` }).from(expenses).where(and(gte(expenses.date, start), lte(expenses.date, end)));

    const revenue = toNum(s.total);
    const cogs = toNum(p.total);
    const exps = toNum(e.total);
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - exps;

    return res.json({ period: String(period), revenue, costOfGoods: cogs, grossProfit, expenses: exps, netProfit, totalPurchases: cogs, breakdown: [] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/reports/inventory
router.get('/inventory', async (_req, res) => {
  try {
    const { products } = await import('@workspace/db');
    const { categories } = await import('@workspace/db');
    const all = await db.select().from(products);
    const total = all.reduce((acc, p) => acc + toNum(p.currentStock) * toNum(p.costPrice), 0);
    return res.json({ totalProducts: all.length, totalStock: all.reduce((a, p) => a + toNum(p.currentStock), 0), totalValue: total, categories: [] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/reports/monthly-summary - monthly report data
router.get('/monthly-summary', async (req, res) => {
  try {
    const { year, month } = req.query;
    const y = Number(year) || new Date().getFullYear();
    const m = Number(month) || new Date().getMonth() + 1;
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59);

    const salesRows = await db.select().from(sales).where(and(gte(sales.saleDate, start), lte(sales.saleDate, end))).orderBy(sql`sale_date ASC`);
    const purchaseRows = await db.select().from(purchases).where(and(gte(purchases.purchaseDate, start), lte(purchases.purchaseDate, end))).orderBy(sql`purchase_date ASC`);
    const expenseRows = await db.select().from(expenses).where(and(gte(expenses.date, start), lte(expenses.date, end))).orderBy(sql`date ASC`);

    const totalSales = salesRows.reduce((a, s) => a + toNum(s.total), 0);
    const totalPurchases = purchaseRows.reduce((a, p) => a + toNum(p.total), 0);
    const totalExpenses = expenseRows.reduce((a, e) => a + toNum(e.amount), 0);
    const grossProfit = totalSales - totalPurchases;
    const netProfit = grossProfit - totalExpenses;

    // Customer balances
    const custRows = await db.select().from(customers).where(sql`CAST(current_balance AS NUMERIC) != 0`);
    const totalReceivable = custRows.filter(c => toNum(c.currentBalance) > 0).reduce((a, c) => a + toNum(c.currentBalance), 0);

    const suppRows = await db.select().from(suppliers).where(sql`CAST(current_balance AS NUMERIC) != 0`);
    const totalPayable = suppRows.filter(s => toNum(s.currentBalance) > 0).reduce((a, s) => a + toNum(s.currentBalance), 0);

    return res.json({
      year: y, month: m, monthName: MONTH_NAMES[m - 1],
      totalSales, totalPurchases, totalExpenses, grossProfit, netProfit,
      totalReceivable, totalPayable,
      sales: salesRows.map(s => ({ ...s, total: toNum(s.total), saleDate: s.saleDate.toISOString() })),
      purchases: purchaseRows.map(p => ({ ...p, total: toNum(p.total), purchaseDate: p.purchaseDate.toISOString() })),
      expenses: expenseRows.map(e => ({ ...e, amount: toNum(e.amount), date: e.date.toISOString() })),
      customers: custRows.map(c => ({ ...c, currentBalance: toNum(c.currentBalance) })),
      suppliers: suppRows.map(s => ({ ...s, currentBalance: toNum(s.currentBalance) })),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/reports/export-excel - generate Excel report
router.post('/export-excel', async (req, res) => {
  try {
    const { year, month } = req.body;
    const y = Number(year) || new Date().getFullYear();
    const m = Number(month) || new Date().getMonth() + 1;
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59);
    const monthName = MONTH_NAMES[m - 1];

    const salesRows = await db.select().from(sales).where(and(gte(sales.saleDate, start), lte(sales.saleDate, end))).orderBy(sql`sale_date ASC`);
    const purchaseRows = await db.select().from(purchases).where(and(gte(purchases.purchaseDate, start), lte(purchases.purchaseDate, end))).orderBy(sql`purchase_date ASC`);
    const expenseRows = await db.select().from(expenses).where(and(gte(expenses.date, start), lte(expenses.date, end))).orderBy(sql`date ASC`);
    const custRows = await db.select().from(customers);
    const suppRows = await db.select().from(suppliers);

    const totalSales = salesRows.reduce((a, s) => a + toNum(s.total), 0);
    const totalPurchases = purchaseRows.reduce((a, p) => a + toNum(p.total), 0);
    const totalExpenses = expenseRows.reduce((a, e) => a + toNum(e.amount), 0);
    const grossProfit = totalSales - totalPurchases;
    const netProfit = grossProfit - totalExpenses;
    const totalReceivable = custRows.filter(c => toNum(c.currentBalance) > 0).reduce((a, c) => a + toNum(c.currentBalance), 0);
    const totalPayable = suppRows.filter(s => toNum(s.currentBalance) > 0).reduce((a, s) => a + toNum(s.currentBalance), 0);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Al Ghani ERP';
    wb.created = new Date();

    const boldStyle: Partial<ExcelJS.Style> = { font: { bold: true } };
    const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

    function addHeader(ws: ExcelJS.Worksheet, cols: string[]) {
      const row = ws.addRow(cols);
      row.eachCell(cell => { cell.fill = headerFill; cell.font = headerFont; cell.alignment = { horizontal: 'center' }; cell.border = { bottom: { style: 'thin' } }; });
      return row;
    }

    function fmt(n: number) { return Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2 }); }
    function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-PK'); }

    // === Dashboard Sheet ===
    const dash = wb.addWorksheet('📊 Dashboard');
    dash.getColumn(1).width = 35; dash.getColumn(2).width = 20;
    dash.addRow([`Al Ghani Traders - Monthly Report: ${monthName} ${y}`]).font = { bold: true, size: 14, color: { argb: 'FF1E40AF' } };
    dash.addRow([]);
    const kpis = [
      ['Total Revenue (Sales)', totalSales],
      ['Cost of Goods (Purchases)', totalPurchases],
      ['Gross Profit', grossProfit],
      ['Total Expenses', totalExpenses],
      ['Net Profit', netProfit],
      ['', ''],
      ['Total Sales Count', salesRows.length],
      ['Total Purchase Count', purchaseRows.length],
      ['Total Expenses Count', expenseRows.length],
      ['', ''],
      ['Customers Receivable (Balance)', totalReceivable],
      ['Suppliers Payable (Balance)', totalPayable],
    ];
    kpis.forEach(([label, val]) => {
      const r = dash.addRow([label, typeof val === 'number' ? fmt(val) : val]);
      r.getCell(1).font = { bold: true };
      if (typeof val === 'number') r.getCell(2).alignment = { horizontal: 'right' };
    });

    // === Sales Sheet ===
    const salesWs = wb.addWorksheet('💰 Sales');
    [1,2,3,4,5,6,7].forEach((c,i) => salesWs.getColumn(c).width = [15,20,25,15,12,12,12][i]);
    addHeader(salesWs, ['Date','Invoice #','Customer','Status','Subtotal','Discount','Total']);
    salesRows.forEach(s => salesWs.addRow([fmtDate(s.saleDate.toISOString()), s.invoiceNumber, s.customerName, s.status, fmt(toNum(s.subtotal)), fmt(toNum(s.discount)), fmt(toNum(s.total))]));
    const salSubRow = salesWs.addRow(['','','','Grand Total','', '', fmt(totalSales)]);
    salSubRow.getCell(7).font = { bold: true }; salSubRow.getCell(4).font = { bold: true };

    // === Purchases Sheet ===
    const purchWs = wb.addWorksheet('🛒 Purchases');
    [1,2,3,4,5,6].forEach((c,i) => purchWs.getColumn(c).width = [15,20,25,15,12,12][i]);
    addHeader(purchWs, ['Date','PO #','Supplier','Status','Subtotal','Total']);
    purchaseRows.forEach(p => purchWs.addRow([fmtDate(p.purchaseDate.toISOString()), p.poNumber, p.supplierName, p.status, fmt(toNum(p.subtotal)), fmt(toNum(p.total))]));
    const purSubRow = purchWs.addRow(['','','','Grand Total','', fmt(totalPurchases)]);
    purSubRow.getCell(6).font = { bold: true }; purSubRow.getCell(4).font = { bold: true };

    // === Expenses Sheet ===
    const expWs = wb.addWorksheet('💸 Expenses');
    [1,2,3,4].forEach((c,i) => expWs.getColumn(c).width = [15,30,20,12][i]);
    addHeader(expWs, ['Date','Title','Category','Amount']);
    expenseRows.forEach(e => expWs.addRow([fmtDate(e.date.toISOString()), e.title, e.category, fmt(toNum(e.amount))]));
    const expSubRow = expWs.addRow(['','','Grand Total', fmt(totalExpenses)]);
    expSubRow.getCell(4).font = { bold: true }; expSubRow.getCell(3).font = { bold: true };

    // === Customers Sheet ===
    const custWs = wb.addWorksheet('👥 Customers');
    [1,2,3,4,5,6,7].forEach((c,i) => custWs.getColumn(c).width = [25,15,20,12,12,12,12][i]);
    addHeader(custWs, ['Name','Phone','City','Type','Total Orders','Total Spent','Balance']);
    custRows.forEach(c => custWs.addRow([c.name, c.phone, c.city || '', c.type, c.totalOrders, fmt(toNum(c.totalSpent)), fmt(toNum(c.currentBalance))]));
    const totalCustBal = custRows.reduce((a,c) => a + Math.max(0, toNum(c.currentBalance)), 0);
    const custSub = custWs.addRow(['','','','','','Total Receivable:', fmt(totalCustBal)]);
    custSub.getCell(7).font = { bold: true }; custSub.getCell(6).font = { bold: true };

    // === Suppliers Sheet ===
    const suppWs = wb.addWorksheet('🏭 Suppliers');
    [1,2,3,4,5].forEach((c,i) => suppWs.getColumn(c).width = [25,15,20,12,12][i]);
    addHeader(suppWs, ['Name','Phone','City','Opening Balance','Current Balance']);
    suppRows.forEach(s => suppWs.addRow([s.name, s.phone, s.city || '', fmt(toNum(s.openingBalance)), fmt(toNum(s.currentBalance))]));
    const totalSuppBal = suppRows.reduce((a,s) => a + Math.max(0, toNum(s.currentBalance)), 0);
    const suppSub = suppWs.addRow(['','','','Total Payable:', fmt(totalSuppBal)]);
    suppSub.getCell(5).font = { bold: true }; suppSub.getCell(4).font = { bold: true };

    // === P&L Sheet ===
    const plWs = wb.addWorksheet('📈 Profit & Loss');
    plWs.getColumn(1).width = 35; plWs.getColumn(2).width = 20;
    plWs.addRow([`Profit & Loss Statement - ${monthName} ${y}`]).font = { bold: true, size: 13 };
    plWs.addRow([]);
    const plRows = [
      ['Revenue', totalSales], ['Cost of Goods Sold (COGS)', totalPurchases],
      ['Gross Profit', grossProfit], ['', ''], ['Operating Expenses', totalExpenses],
      ['Net Profit / Loss', netProfit],
    ];
    plRows.forEach(([l, v]) => {
      const r = plWs.addRow([l, typeof v === 'number' ? fmt(v) : v]);
      if (l === 'Net Profit / Loss' || l === 'Gross Profit') {
        r.getCell(1).font = { bold: true };
        r.getCell(2).font = { bold: true, color: { argb: (Number(v) >= 0) ? 'FF166534' : 'FFB91C1C' } };
      }
    });

    // Write to temp file
    const tmpPath = path.join(os.tmpdir(), `AlGhani_${monthName}_${y}.xlsx`);
    await wb.xlsx.writeFile(tmpPath);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="AlGhani_${monthName}_${y}.xlsx"`);
    const fileBuffer = fs.readFileSync(tmpPath);
    return res.send(fileBuffer);
    fs.unlinkSync(tmpPath);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/reports/send-report - send via email + telegram
router.post('/send-report', async (req, res) => {
  try {
    const { year, month, channels = ['email', 'telegram'] } = req.body;
    const y = Number(year) || new Date().getFullYear();
    const m = Number(month) || new Date().getMonth() + 1;
    const monthName = MONTH_NAMES[m - 1];
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59);

    const salesRows = await db.select().from(sales).where(and(gte(sales.saleDate, start), lte(sales.saleDate, end)));
    const purchaseRows = await db.select().from(purchases).where(and(gte(purchases.purchaseDate, start), lte(purchases.purchaseDate, end)));
    const expenseRows = await db.select().from(expenses).where(and(gte(expenses.date, start), lte(expenses.date, end)));

    const totalSales = salesRows.reduce((a, s) => a + toNum(s.total), 0);
    const totalPurchases = purchaseRows.reduce((a, p) => a + toNum(p.total), 0);
    const totalExpenses = expenseRows.reduce((a, e) => a + toNum(e.amount), 0);
    const grossProfit = totalSales - totalPurchases;
    const netProfit = grossProfit - totalExpenses;

    const fmt = (n: number) => `PKR ${n.toLocaleString('en-PK', { minimumFractionDigits: 2 })}`;

    // Generate Excel
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Summary');
    ws.addRow(['Al Ghani Monthly Report', `${monthName} ${y}`]);
    ws.addRow(['Total Sales', totalSales]);
    ws.addRow(['Total Purchases', totalPurchases]);
    ws.addRow(['Gross Profit', grossProfit]);
    ws.addRow(['Total Expenses', totalExpenses]);
    ws.addRow(['Net Profit', netProfit]);
    const tmpPath = path.join(os.tmpdir(), `AlGhani_Report_${monthName}_${y}.xlsx`);
    await wb.xlsx.writeFile(tmpPath);

    const errors: string[] = [];

    if (channels.includes('email')) {
      try { await sendMonthlyReport(tmpPath, monthName, y); }
      catch (e: any) { errors.push(`Email: ${e.message}`); }
    }

    if (channels.includes('telegram')) {
      const msg = `📊 <b>Al Ghani Monthly Report - ${monthName} ${y}</b>\n\n💰 Total Sales: ${fmt(totalSales)}\n🛒 Total Purchases: ${fmt(totalPurchases)}\n📈 Gross Profit: ${fmt(grossProfit)}\n💸 Expenses: ${fmt(totalExpenses)}\n✅ Net Profit: ${fmt(netProfit)}`;
      try {
        await sendTelegramMessage(msg);
        await sendTelegramDocument(tmpPath, `Monthly Report ${monthName} ${y}`);
      } catch (e: any) { errors.push(`Telegram: ${e.message}`); }
    }

    fs.unlinkSync(tmpPath);
    return res.json({ message: 'Report sent', errors: errors.length ? errors : undefined });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
