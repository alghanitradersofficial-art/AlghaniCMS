import { Router } from "express";
import { pool } from "@workspace/db";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

const router = Router();

async function getCompanySettings() {
  try {
    const result = await pool.query(`SELECT key, value FROM company_settings`);
    const settings: Record<string, unknown> = {};
    for (const row of result.rows) settings[row.key] = row.value;
    return {
      company: (settings.company as Record<string, string>) || {
        name: "Al Ghani Wholesale Traders",
        address: "Shop No. 12, Hafeez Centre, Gulberg III, Lahore, Pakistan",
        phone: "+92-42-35761234",
        email: "info@alghani.com",
        branch: "Main Branch - Lahore",
        ceoName: "Mr. Abdul Ghani",
        ntn: "1234567-8",
      },
    };
  } catch {
    return {
      company: {
        name: "Al Ghani Wholesale Traders",
        address: "Shop No. 12, Hafeez Centre, Gulberg III, Lahore, Pakistan",
        phone: "+92-42-35761234",
        email: "info@alghani.com",
        branch: "Main Branch - Lahore",
        ceoName: "Mr. Abdul Ghani",
        ntn: "1234567-8",
      },
    };
  }
}

function addPdfHeader(doc: PDFKit.PDFDocument, company: Record<string, string>, title: string) {
  doc.rect(0, 0, doc.page.width, 100).fill("#1a1a1a");
  doc.fillColor("#DC2626").fontSize(20).font("Helvetica-Bold").text(company.name || "Al Ghani Wholesale Traders", 40, 20);
  doc.fillColor("#D97706").fontSize(9).font("Helvetica").text(company.branch || "", 40, 46);
  doc.fillColor("#999999").fontSize(8).text(`${company.address || ""}  |  ${company.phone || ""}  |  ${company.email || ""}`, 40, 60);
  doc.fillColor("#777777").fontSize(7).text(`NTN: ${company.ntn || ""}`, 40, 74);
  doc.fillColor("#ffffff").fontSize(14).font("Helvetica-Bold").text(title, 0, 30, { align: "right", width: doc.page.width - 40 });
  doc.fillColor("#555555").fontSize(8).font("Helvetica").text(`Generated: ${new Date().toLocaleString("en-PK")}`, 0, 50, { align: "right", width: doc.page.width - 40 });
  doc.moveDown(1);
  doc.y = 115;
}

function addPdfFooter(doc: PDFKit.PDFDocument, company: Record<string, string>) {
  const bottom = doc.page.height - 40;
  doc.rect(0, bottom - 10, doc.page.width, 50).fill("#1a1a1a");
  doc.fillColor("#555555").fontSize(7).font("Helvetica")
    .text(`CEO: ${company.ceoName || ""}  |  ${company.ceoPhone || ""}  |  ${company.ceoEmail || ""}`, 40, bottom, { align: "left" });
  doc.fillColor("#DC2626").fontSize(7)
    .text("Al Ghani ERP System", 0, bottom, { align: "right", width: doc.page.width - 40 });
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

// ─── SALES EXPORT ────────────────────────────────────────────────────────────
router.get("/sales/pdf", async (req, res) => {
  try {
    const { company } = await getCompanySettings();
    const result = await pool.query(`SELECT * FROM sales ORDER BY created_at DESC`);
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="sales-report.pdf"');
    doc.pipe(res);
    addPdfHeader(doc, company, "Sales Report");

    const headers = ["Invoice", "Customer", "Date", "Status", "Total"];
    const colWidths = [80, 160, 90, 70, 80];
    let x = 40;
    doc.fillColor("#DC2626").fontSize(9).font("Helvetica-Bold");
    headers.forEach((h, i) => { doc.text(h, x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
    doc.moveDown(0.3);
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor("#DC2626").stroke();
    doc.moveDown(0.3);

    let total = 0;
    for (const row of result.rows) {
      x = 40;
      const y = doc.y;
      doc.fillColor("#ffffff").fontSize(8).font("Helvetica");
      doc.text(row.invoice_number, x, y, { width: colWidths[0] }); x += colWidths[0];
      doc.text(row.customer_name, x, y, { width: colWidths[1] }); x += colWidths[1];
      doc.text(new Date(row.created_at).toLocaleDateString("en-PK"), x, y, { width: colWidths[2] }); x += colWidths[2];
      doc.fillColor(row.status === "completed" ? "#22c55e" : row.status === "pending" ? "#D97706" : "#ef4444");
      doc.text(row.status.toUpperCase(), x, y, { width: colWidths[3] }); x += colWidths[3];
      doc.fillColor("#D97706").font("Helvetica-Bold");
      doc.text(`Rs. ${parseFloat(row.total).toLocaleString()}`, x, y, { width: colWidths[4] });
      doc.moveDown(0.6);
      total += parseFloat(row.total);
      if (doc.y > doc.page.height - 80) { doc.addPage(); doc.y = 40; }
    }

    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor("#D97706").stroke();
    doc.moveDown(0.3);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10)
      .text(`TOTAL SALES:`, 40, doc.y, { continued: true })
      .fillColor("#D97706").text(`  Rs. ${total.toLocaleString()}`, { align: "right", width: doc.page.width - 80 });

    addPdfFooter(doc, company);
    doc.end();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to export PDF" });
  }
});

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
    console.error(error);
    return res.status(500).json({ error: "Failed to export Excel" });
  }
});

// ─── PURCHASES EXPORT ────────────────────────────────────────────────────────
router.get("/purchases/pdf", async (req, res) => {
  try {
    const { company } = await getCompanySettings();
    const result = await pool.query(`SELECT * FROM purchases ORDER BY created_at DESC`);
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="purchases-report.pdf"');
    doc.pipe(res);
    addPdfHeader(doc, company, "Purchases Report");

    const headers = ["PO Number", "Supplier", "Date", "Status", "Total"];
    const colWidths = [90, 150, 90, 70, 80];
    let x = 40;
    doc.fillColor("#DC2626").fontSize(9).font("Helvetica-Bold");
    headers.forEach((h, i) => { doc.text(h, x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
    doc.moveDown(0.3);
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor("#DC2626").stroke();
    doc.moveDown(0.3);

    let total = 0;
    for (const row of result.rows) {
      x = 40;
      const y = doc.y;
      doc.fillColor("#ffffff").fontSize(8).font("Helvetica");
      doc.text(row.po_number, x, y, { width: colWidths[0] }); x += colWidths[0];
      doc.text(row.supplier_name, x, y, { width: colWidths[1] }); x += colWidths[1];
      doc.text(new Date(row.created_at).toLocaleDateString("en-PK"), x, y, { width: colWidths[2] }); x += colWidths[2];
      doc.fillColor(row.status === "received" ? "#22c55e" : row.status === "pending" ? "#D97706" : "#ef4444");
      doc.text(row.status.toUpperCase(), x, y, { width: colWidths[3] }); x += colWidths[3];
      doc.fillColor("#D97706").font("Helvetica-Bold");
      doc.text(`Rs. ${parseFloat(row.total).toLocaleString()}`, x, y, { width: colWidths[4] });
      doc.moveDown(0.6);
      total += parseFloat(row.total);
      if (doc.y > doc.page.height - 80) { doc.addPage(); doc.y = 40; }
    }
    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor("#D97706").stroke();
    doc.moveDown(0.3);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10)
      .text(`TOTAL PURCHASES:`, 40, doc.y, { continued: true })
      .fillColor("#D97706").text(`  Rs. ${total.toLocaleString()}`, { align: "right", width: doc.page.width - 80 });
    addPdfFooter(doc, company);
    doc.end();
  } catch (error) {
    return res.status(500).json({ error: "Failed to export PDF" });
  }
});

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
router.get("/inventory/pdf", async (req, res) => {
  try {
    const { company } = await getCompanySettings();
    const result = await pool.query(`
      SELECT p.*, c.name as cat_name, b.name as brand_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN brands b ON b.id = p.brand_id
      ORDER BY p.name
    `);
    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="inventory-report.pdf"');
    doc.pipe(res);
    addPdfHeader(doc, company, "Inventory Report");

    const headers = ["SKU", "Product Name", "Category", "Brand", "Cost", "Sale Price", "Stock", "Min Stock", "Value"];
    const colWidths = [60, 160, 80, 70, 55, 65, 45, 55, 70];
    let x = 30;
    doc.fillColor("#DC2626").fontSize(8).font("Helvetica-Bold");
    headers.forEach((h, i) => { doc.text(h, x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
    doc.moveDown(0.3);
    doc.moveTo(30, doc.y).lineTo(doc.page.width - 30, doc.y).strokeColor("#DC2626").stroke();
    doc.moveDown(0.3);

    let totalValue = 0;
    for (const row of result.rows) {
      x = 30;
      const y = doc.y;
      const val = parseFloat(row.cost_price) * parseInt(row.current_stock);
      doc.fillColor("#cccccc").fontSize(7).font("Helvetica");
      doc.text(row.sku, x, y, { width: colWidths[0] }); x += colWidths[0];
      doc.fillColor("#ffffff").font("Helvetica-Bold");
      doc.text(row.name, x, y, { width: colWidths[1] }); x += colWidths[1];
      doc.fillColor("#cccccc").font("Helvetica");
      doc.text(row.cat_name || "", x, y, { width: colWidths[2] }); x += colWidths[2];
      doc.text(row.brand_name || "", x, y, { width: colWidths[3] }); x += colWidths[3];
      doc.text(`Rs. ${parseFloat(row.cost_price).toLocaleString()}`, x, y, { width: colWidths[4] }); x += colWidths[4];
      doc.fillColor("#D97706");
      doc.text(`Rs. ${parseFloat(row.sale_price).toLocaleString()}`, x, y, { width: colWidths[5] }); x += colWidths[5];
      doc.fillColor(parseInt(row.current_stock) <= parseInt(row.min_stock) ? "#ef4444" : "#22c55e");
      doc.text(`${row.current_stock} ${row.unit}`, x, y, { width: colWidths[6] }); x += colWidths[6];
      doc.fillColor("#999999");
      doc.text(`${row.min_stock}`, x, y, { width: colWidths[7] }); x += colWidths[7];
      doc.fillColor("#D97706").font("Helvetica-Bold");
      doc.text(`Rs. ${val.toLocaleString()}`, x, y, { width: colWidths[8] });
      doc.moveDown(0.55);
      totalValue += val;
      if (doc.y > doc.page.height - 80) { doc.addPage(); doc.y = 40; }
    }
    doc.moveDown(0.5);
    doc.moveTo(30, doc.y).lineTo(doc.page.width - 30, doc.y).strokeColor("#D97706").stroke();
    doc.moveDown(0.3);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10)
      .text(`TOTAL INVENTORY VALUE:`, 30, doc.y, { continued: true })
      .fillColor("#D97706").text(`  Rs. ${totalValue.toLocaleString()}`, { align: "right", width: doc.page.width - 60 });
    addPdfFooter(doc, company);
    doc.end();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to export PDF" });
  }
});

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
    const cols = 9;
    addExcelBranding(ws, company, "Inventory Report", cols);
    ws.columns = [
      { key: "sku", width: 14 }, { key: "name", width: 30 }, { key: "cat", width: 16 },
      { key: "brand", width: 14 }, { key: "cost", width: 14 }, { key: "sale", width: 14 },
      { key: "stock", width: 12 }, { key: "min", width: 12 }, { key: "value", width: 16 },
    ];
    ws.addRow(["SKU", "Product Name", "Category", "Brand", "Cost Price", "Sale Price", "Stock", "Min Stock", "Value"]);
    styleExcelHeader(ws, 4, cols);
    let totalValue = 0;
    for (const row of result.rows) {
      const val = parseFloat(row.cost_price) * parseInt(row.current_stock);
      const r = ws.addRow({
        sku: row.sku, name: row.name, cat: row.cat_name, brand: row.brand_name,
        cost: parseFloat(row.cost_price), sale: parseFloat(row.sale_price),
        stock: parseInt(row.current_stock), min: parseInt(row.min_stock), value: val,
      });
      if (parseInt(row.current_stock) <= parseInt(row.min_stock)) {
        r.getCell(7).font = { color: { argb: "FFef4444" }, bold: true };
      }
      r.getCell(9).font = { bold: true, color: { argb: "FFD97706" } };
      totalValue += val;
    }
    const totalRow = ws.addRow(["", "", "", "", "", "", "", "TOTAL VALUE", totalValue]);
    totalRow.font = { bold: true, color: { argb: "FFDC2626" } };
    totalRow.getCell(9).font = { bold: true, color: { argb: "FFD97706" } };
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="inventory-report.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    return res.status(500).json({ error: "Failed to export Excel" });
  }
});

// ─── EXPENSES EXPORT ─────────────────────────────────────────────────────────
router.get("/expenses/pdf", async (req, res) => {
  try {
    const { company } = await getCompanySettings();
    const result = await pool.query(`SELECT * FROM expenses ORDER BY created_at DESC`);
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="expenses-report.pdf"');
    doc.pipe(res);
    addPdfHeader(doc, company, "Expenses Report");
    const headers = ["Title", "Category", "Date", "Amount"];
    const colWidths = [200, 130, 100, 100];
    let x = 40;
    doc.fillColor("#DC2626").fontSize(9).font("Helvetica-Bold");
    headers.forEach((h, i) => { doc.text(h, x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
    doc.moveDown(0.3);
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor("#DC2626").stroke();
    doc.moveDown(0.3);
    let total = 0;
    for (const row of result.rows) {
      x = 40; const y = doc.y;
      doc.fillColor("#ffffff").fontSize(8).font("Helvetica");
      doc.text(row.title, x, y, { width: colWidths[0] }); x += colWidths[0];
      doc.fillColor("#cccccc").text(row.category || "General", x, y, { width: colWidths[1] }); x += colWidths[1];
      doc.text(new Date(row.created_at).toLocaleDateString("en-PK"), x, y, { width: colWidths[2] }); x += colWidths[2];
      doc.fillColor("#D97706").font("Helvetica-Bold");
      doc.text(`Rs. ${parseFloat(row.amount).toLocaleString()}`, x, y, { width: colWidths[3] });
      doc.moveDown(0.6);
      total += parseFloat(row.amount);
      if (doc.y > doc.page.height - 80) { doc.addPage(); doc.y = 40; }
    }
    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor("#D97706").stroke();
    doc.moveDown(0.3);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10)
      .text(`TOTAL EXPENSES:`, 40, doc.y, { continued: true })
      .fillColor("#DC2626").text(`  Rs. ${total.toLocaleString()}`, { align: "right", width: doc.page.width - 80 });
    addPdfFooter(doc, company);
    doc.end();
  } catch (error) {
    return res.status(500).json({ error: "Failed to export PDF" });
  }
});

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
router.get("/report/pdf", async (req, res) => {
  try {
    const { company } = await getCompanySettings();
    const [salesRes, purchasesRes, expensesRes, productsRes] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(total::numeric),0) as total, COUNT(*) as count FROM sales WHERE status != 'cancelled'`),
      pool.query(`SELECT COALESCE(SUM(total::numeric),0) as total, COUNT(*) as count FROM purchases WHERE status != 'cancelled'`),
      pool.query(`SELECT COALESCE(SUM(amount::numeric),0) as total FROM expenses`),
      pool.query(`SELECT COUNT(*) as total, SUM(current_stock) as stock, COALESCE(SUM(current_stock::numeric*cost_price::numeric),0) as value FROM products`),
    ]);
    const revenue = parseFloat(salesRes.rows[0].total);
    const purchases = parseFloat(purchasesRes.rows[0].total);
    const expenses = parseFloat(expensesRes.rows[0].total);
    const netProfit = revenue - purchases - expenses;
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="full-report.pdf"');
    doc.pipe(res);
    addPdfHeader(doc, company, "Full Business Report");
    const items = [
      ["Total Revenue (Sales)", `Rs. ${revenue.toLocaleString()}`],
      ["Total Purchases (COGS)", `Rs. ${purchases.toLocaleString()}`],
      ["Gross Profit", `Rs. ${(revenue - purchases).toLocaleString()}`],
      ["Total Expenses", `Rs. ${expenses.toLocaleString()}`],
      ["Net Profit", `Rs. ${netProfit.toLocaleString()}`],
      ["Total Orders", `${salesRes.rows[0].count}`],
      ["Total Purchase Orders", `${purchasesRes.rows[0].count}`],
      ["Total Products", `${productsRes.rows[0].total}`],
      ["Total Inventory Value", `Rs. ${parseFloat(productsRes.rows[0].value).toLocaleString()}`],
    ];
    for (const [label, val] of items) {
      const y = doc.y;
      doc.fillColor("#cccccc").fontSize(10).font("Helvetica").text(label, 40, y, { width: 300 });
      doc.fillColor("#D97706").font("Helvetica-Bold").text(val, 340, y, { width: 200, align: "right" });
      doc.moveDown(0.7);
      doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor("#333333").stroke();
      doc.moveDown(0.3);
    }
    doc.moveDown(1);
    doc.fillColor(netProfit >= 0 ? "#22c55e" : "#ef4444").fontSize(14).font("Helvetica-Bold")
      .text(`NET PROFIT: Rs. ${netProfit.toLocaleString()}`, { align: "center" });
    addPdfFooter(doc, company);
    doc.end();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to export report" });
  }
});

router.get("/report/excel", async (req, res) => {
  try {
    const { company } = await getCompanySettings();
    const [sRes, pRes, eRes] = await Promise.all([
      pool.query(`SELECT * FROM sales ORDER BY created_at DESC`),
      pool.query(`SELECT * FROM purchases ORDER BY created_at DESC`),
      pool.query(`SELECT * FROM expenses ORDER BY created_at DESC`),
    ]);
    const wb = new ExcelJS.Workbook();
    wb.creator = company.name;

    // Sales sheet
    const ws1 = wb.addWorksheet("Sales");
    addExcelBranding(ws1, company, "Sales Report", 5);
    ws1.columns = [{ key: "inv", width: 16 }, { key: "cust", width: 28 }, { key: "date", width: 16 }, { key: "status", width: 14 }, { key: "total", width: 16 }];
    ws1.addRow(["Invoice", "Customer", "Date", "Status", "Total"]); styleExcelHeader(ws1, 4, 5);
    for (const r of sRes.rows) ws1.addRow({ inv: r.invoice_number, cust: r.customer_name, date: new Date(r.created_at).toLocaleDateString("en-PK"), status: r.status, total: parseFloat(r.total) });

    // Purchases sheet
    const ws2 = wb.addWorksheet("Purchases");
    addExcelBranding(ws2, company, "Purchases Report", 5);
    ws2.columns = [{ key: "po", width: 16 }, { key: "sup", width: 28 }, { key: "date", width: 16 }, { key: "status", width: 14 }, { key: "total", width: 16 }];
    ws2.addRow(["PO #", "Supplier", "Date", "Status", "Total"]); styleExcelHeader(ws2, 4, 5);
    for (const r of pRes.rows) ws2.addRow({ po: r.po_number, sup: r.supplier_name, date: new Date(r.created_at).toLocaleDateString("en-PK"), status: r.status, total: parseFloat(r.total) });

    // Expenses sheet
    const ws3 = wb.addWorksheet("Expenses");
    addExcelBranding(ws3, company, "Expenses Report", 4);
    ws3.columns = [{ key: "title", width: 30 }, { key: "cat", width: 20 }, { key: "date", width: 16 }, { key: "amount", width: 16 }];
    ws3.addRow(["Title", "Category", "Date", "Amount"]); styleExcelHeader(ws3, 4, 4);
    for (const r of eRes.rows) ws3.addRow({ title: r.title, cat: r.category || "General", date: new Date(r.created_at).toLocaleDateString("en-PK"), amount: parseFloat(r.amount) });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="full-report.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to export Excel" });
  }
});

// ─── SINGLE SALE INVOICE PDF ─────────────────────────────────────────────────
router.get("/invoice/:id/pdf", async (req, res) => {
  try {
    const { company } = await getCompanySettings();
    const id = parseInt(req.params.id);
    const result = await pool.query(`SELECT * FROM sales WHERE id = $1`, [id]);
    if (!result.rows.length) return res.status(404).json({ error: "Sale not found" });
    const sale = result.rows[0];
    const items: Array<{ productName: string; quantity: number; unitPrice: number; total: number }> = Array.isArray(sale.items) ? sale.items : JSON.parse(sale.items || "[]");
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="invoice-${sale.invoice_number}.pdf"`);
    doc.pipe(res);

    doc.rect(0, 0, doc.page.width, 120).fill("#1a1a1a");
    doc.fillColor("#DC2626").fontSize(22).font("Helvetica-Bold").text(company.name, 40, 20);
    doc.fillColor("#D97706").fontSize(9).text(company.branch || "", 40, 48);
    doc.fillColor("#888888").fontSize(8).font("Helvetica").text(`${company.address}`, 40, 63).text(`${company.phone}  |  ${company.email}`, 40, 76).text(`NTN: ${company.ntn}`, 40, 89);
    doc.fillColor("#ffffff").fontSize(18).font("Helvetica-Bold").text("INVOICE", 0, 28, { align: "right", width: doc.page.width - 40 });
    doc.fillColor("#D97706").fontSize(12).text(`#${sale.invoice_number}`, 0, 52, { align: "right", width: doc.page.width - 40 });
    doc.fillColor("#888888").fontSize(8).font("Helvetica").text(`Date: ${new Date(sale.created_at).toLocaleDateString("en-PK")}`, 0, 70, { align: "right", width: doc.page.width - 40 });
    doc.fillColor(sale.status === "completed" ? "#22c55e" : sale.status === "pending" ? "#D97706" : "#ef4444").fontSize(9).text(`Status: ${sale.status.toUpperCase()}`, 0, 84, { align: "right", width: doc.page.width - 40 });
    doc.y = 135;

    doc.fillColor("#DC2626").fontSize(9).font("Helvetica-Bold").text("BILL TO:", 40, doc.y);
    doc.moveDown(0.3);
    doc.fillColor("#ffffff").fontSize(10).font("Helvetica-Bold").text(sale.customer_name, 40, doc.y);
    doc.moveDown(0.2);
    if (sale.notes) { doc.fillColor("#888888").fontSize(8).font("Helvetica").text(`Notes: ${sale.notes}`, 40, doc.y); doc.moveDown(0.3); }
    doc.moveDown(0.8);

    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor("#333333").stroke();
    doc.moveDown(0.5);
    const colW = [220, 80, 100, 100];
    let x = 40;
    doc.fillColor("#DC2626").fontSize(9).font("Helvetica-Bold");
    ["Product", "Qty", "Unit Price", "Total"].forEach((h, i) => { doc.text(h, x, doc.y, { width: colW[i] }); x += colW[i]; });
    doc.moveDown(0.3);
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor("#DC2626").stroke();
    doc.moveDown(0.3);

    for (const item of items) {
      x = 40; const y = doc.y;
      doc.fillColor("#ffffff").fontSize(9).font("Helvetica");
      doc.text(item.productName || "Product", x, y, { width: colW[0] }); x += colW[0];
      doc.text(String(item.quantity), x, y, { width: colW[1] }); x += colW[1];
      doc.fillColor("#cccccc").text(`Rs. ${(item.unitPrice || 0).toLocaleString()}`, x, y, { width: colW[2] }); x += colW[2];
      doc.fillColor("#D97706").font("Helvetica-Bold").text(`Rs. ${(item.total || 0).toLocaleString()}`, x, y, { width: colW[3] });
      doc.moveDown(0.6);
    }

    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor("#333333").stroke();
    doc.moveDown(0.5);

    const summaryX = 340;
    const labelW = 100; const valW = 100;
    const addSummaryRow = (label: string, val: string, highlight = false) => {
      const y = doc.y;
      doc.fillColor("#888888").fontSize(9).font("Helvetica").text(label, summaryX, y, { width: labelW });
      doc.fillColor(highlight ? "#D97706" : "#ffffff").font(highlight ? "Helvetica-Bold" : "Helvetica").text(val, summaryX + labelW, y, { width: valW, align: "right" });
      doc.moveDown(0.5);
    };
    addSummaryRow("Subtotal:", `Rs. ${parseFloat(sale.subtotal || sale.total).toLocaleString()}`);
    if (parseFloat(sale.discount || "0") > 0) addSummaryRow("Discount:", `- Rs. ${parseFloat(sale.discount).toLocaleString()}`);
    if (parseFloat(sale.tax || "0") > 0) addSummaryRow("Tax:", `Rs. ${parseFloat(sale.tax).toLocaleString()}`);
    addSummaryRow("TOTAL:", `Rs. ${parseFloat(sale.total).toLocaleString()}`, true);

    doc.moveDown(2);
    doc.fillColor("#555555").fontSize(8).font("Helvetica")
      .text("Thank you for your business!", { align: "center" })
      .text(company.name, { align: "center" });
    addPdfFooter(doc, company);
    doc.end();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to generate invoice" });
  }
});

// ─── CUSTOMERS EXPORT ─────────────────────────────────────────────────────────
router.get("/customers/excel", async (req, res) => {
  try {
    const { company } = await getCompanySettings();
    const result = await pool.query(`SELECT * FROM customers ORDER BY name`);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Customers");
    const cols = 6;
    addExcelBranding(ws, company, "Customers List", cols);
    ws.columns = [{ key: "name", width: 24 }, { key: "phone", width: 18 }, { key: "email", width: 24 }, { key: "city", width: 16 }, { key: "balance", width: 16 }, { key: "joined", width: 14 }];
    ws.addRow(["Name", "Phone", "Email", "City", "Balance", "Joined"]); styleExcelHeader(ws, 4, cols);
    for (const r of result.rows) ws.addRow({ name: r.name, phone: r.phone || "", email: r.email || "", city: r.city || "", balance: parseFloat(r.credit_balance || "0"), joined: new Date(r.created_at).toLocaleDateString("en-PK") });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="customers.xlsx"');
    await wb.xlsx.write(res); res.end();
  } catch (error) {
    return res.status(500).json({ error: "Failed to export" });
  }
});

router.get("/suppliers/excel", async (req, res) => {
  try {
    const { company } = await getCompanySettings();
    const result = await pool.query(`SELECT * FROM suppliers ORDER BY name`);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Suppliers");
    const cols = 6;
    addExcelBranding(ws, company, "Suppliers List", cols);
    ws.columns = [{ key: "name", width: 24 }, { key: "contact", width: 18 }, { key: "phone", width: 18 }, { key: "email", width: 24 }, { key: "city", width: 16 }, { key: "joined", width: 14 }];
    ws.addRow(["Name", "Contact Person", "Phone", "Email", "City", "Joined"]); styleExcelHeader(ws, 4, cols);
    for (const r of result.rows) ws.addRow({ name: r.name, contact: r.contact_person || "", phone: r.phone || "", email: r.email || "", city: r.city || "", joined: new Date(r.created_at).toLocaleDateString("en-PK") });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="suppliers.xlsx"');
    await wb.xlsx.write(res); res.end();
  } catch (error) {
    return res.status(500).json({ error: "Failed to export" });
  }
});

export default router;
