import { Router } from "express";
import { pool, db, productsTable, customersTable, suppliersTable, purchasesTable, salesTable, expensesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import multer from "multer";
import ExcelJS from "exceljs";
import path from "path";
import { groqVision, groqChat, getGroqClient } from "../lib/groq.js";
import { appendLedgerEntry, round2, recomputeCustomerLedgerRunningBalances } from "../lib/ledger.js";
import { appendGeneralLedgerEntry } from "../lib/general-ledger.js";
import { appendSupplierLedgerEntry } from "../lib/supplier-ledger.js";
import { getUserIdFromRequest } from "../lib/auth-context.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function parseNumber(val: unknown): number {
  const n = parseFloat(String(val || "0").replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}
function parseStr(val: unknown): string { return String(val || "").trim(); }
function parseDate(val: unknown): Date {
  if (!val) return new Date();
  const d = new Date(String(val));
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

async function ensureProduct(productData: Record<string, unknown>) {
  const name = parseStr(productData.name);
  const sku = parseStr(productData.sku) || `LEGACY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!name) return null;

  // Product-level sale price was removed (price now varies per customer per
  // sale), so only set it if the import source explicitly provided one.
  const hasSalePrice = productData.salePrice !== undefined && productData.salePrice !== null && productData.salePrice !== "";
  const salePrice = hasSalePrice ? String(parseNumber(productData.salePrice)) : null;

  const [existing] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.sku, sku));
  if (existing) {
    await db.update(productsTable).set({
      name,
      costPrice: String(parseNumber(productData.costPrice)),
      ...(hasSalePrice ? { salePrice } : {}),
      currentStock: parseInt(String(productData.currentStock || 0), 10) || 0,
      minStock: parseInt(String(productData.minStock || 5), 10) || 5,
      unit: parseStr(productData.unit) || "pcs",
    }).where(eq(productsTable.id, existing.id));
    return { id: existing.id, created: false };
  }

  const [inserted] = await db.insert(productsTable).values({
    name,
    sku,
    costPrice: String(parseNumber(productData.costPrice)),
    salePrice,
    currentStock: parseInt(String(productData.currentStock || 0), 10) || 0,
    minStock: parseInt(String(productData.minStock || 5), 10) || 5,
    unit: parseStr(productData.unit) || "pcs",
  }).returning();
  return { id: inserted.id, created: true };
}

async function ensureCustomer(customerData: Record<string, unknown>) {
  const name = parseStr(customerData.name);
  const phone = parseStr(customerData.phone);
  if (!name) return null;

  const [existing] = await db.select().from(customersTable).where(phone ? sql`${customersTable.phone} = ${phone}` : eq(customersTable.name, name)).limit(1);
  if (existing) {
    await db.update(customersTable).set({
      name,
      phone: phone || existing.phone,
      email: parseStr(customerData.email) || null,
      address: parseStr(customerData.address) || null,
      city: parseStr(customerData.city) || null,
      type: parseStr(customerData.type) || "retail",
      openingBalance: String(parseNumber(customerData.openingBalance)),
      creditLimit: String(parseNumber(customerData.creditLimit)),
    }).where(eq(customersTable.id, existing.id));
    return { id: existing.id, created: false };
  }

  const [inserted] = await db.insert(customersTable).values({
    name,
    phone: phone || "",
    email: parseStr(customerData.email) || null,
    address: parseStr(customerData.address) || null,
    city: parseStr(customerData.city) || null,
    type: parseStr(customerData.type) || "retail",
    openingBalance: String(parseNumber(customerData.openingBalance)),
    creditLimit: String(parseNumber(customerData.creditLimit)),
  }).returning();
  return { id: inserted.id, created: true };
}

async function ensureSupplier(supplierData: Record<string, unknown>) {
  const name = parseStr(supplierData.name);
  const phone = parseStr(supplierData.phone);
  if (!name) return null;

  const [existing] = await db.select().from(suppliersTable).where(phone ? sql`${suppliersTable.phone} = ${phone}` : eq(suppliersTable.name, name)).limit(1);
  if (existing) {
    await db.update(suppliersTable).set({
      name,
      phone: phone || existing.phone,
      email: parseStr(supplierData.email) || null,
      address: parseStr(supplierData.address) || null,
      city: parseStr(supplierData.city) || null,
      contactPerson: parseStr(supplierData.contactPerson) || null,
      openingBalance: String(parseNumber(supplierData.openingBalance)),
    }).where(eq(suppliersTable.id, existing.id));
    return { id: existing.id, created: false };
  }

  const [inserted] = await db.insert(suppliersTable).values({
    name,
    phone: phone || "",
    email: parseStr(supplierData.email) || null,
    address: parseStr(supplierData.address) || null,
    city: parseStr(supplierData.city) || null,
    contactPerson: parseStr(supplierData.contactPerson) || null,
    openingBalance: String(parseNumber(supplierData.openingBalance)),
  }).returning();
  return { id: inserted.id, created: true };
}

async function ensureExpense(expenseData: Record<string, unknown>, createdByUserId?: number | null) {
  const title = parseStr(expenseData.title);
  const amount = parseNumber(expenseData.amount);
  if (!title || !amount) return null;
  const expenseDate = parseDate(expenseData.date);

  try {
    const months = await import("../services/months.service.js");
    if (await months.isDateInClosedPeriod(expenseDate)) {
      throw new months.MonthClosedError(expenseDate);
    }
  } catch (err) {
    if (err && (err as Error).name === "MonthClosedError") throw err;
  }

  const [inserted] = await db.insert(expensesTable).values({
    title,
    category: parseStr(expenseData.category) || "General",
    amount: String(round2(amount)),
    date: expenseDate.toISOString().slice(0, 10),
    notes: parseStr(expenseData.notes) || null,
    createdByUserId: createdByUserId ?? null,
  }).returning();

  await appendGeneralLedgerEntry(db as any, {
    date: expenseDate,
    type: "expense",
    referenceId: inserted.id,
    partyType: "none",
    amount: round2(amount),
    direction: "debit",
    note: `${parseStr(expenseData.category) || "General"}: ${title}`,
    createdByUserId: createdByUserId ?? null,
  });

  return { id: inserted.id, created: true };
}

async function insertPurchaseRecord(rawPurchase: Record<string, unknown>, createdByUserId?: number | null): Promise<{ id: number } | null> {
  const supplierName = parseStr(rawPurchase.supplierName);
  const supplierId = rawPurchase.supplierId ? Number(rawPurchase.supplierId) : undefined;
  const supplierRow = supplierId
    ? (await db.select({ id: suppliersTable.id }).from(suppliersTable).where(eq(suppliersTable.id, supplierId)).limit(1))[0] ?? null
    : supplierName
      ? (await db.select({ id: suppliersTable.id }).from(suppliersTable).where(eq(suppliersTable.name, supplierName)).limit(1))[0] ?? null
      : null;
  const items = Array.isArray(rawPurchase.items) ? rawPurchase.items : [];
  if (!items.length) return null;

  const purchaseItems = await Promise.all(items.map(async (item: Record<string, unknown>) => {
    const productIdentifier = parseStr(item.sku) || parseStr(item.productName);
    let productId = item.productId ? Number(item.productId) : undefined;
    if (!productId && productIdentifier) {
      const [product] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.sku, productIdentifier));
      productId = product?.id;
    }
    if (!productId && parseStr(item.productName)) {
      const [product] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.name, parseStr(item.productName)));
      productId = product?.id;
    }
    if (!productId) {
      const created = await ensureProduct({ name: parseStr(item.productName) || `Imported item ${Date.now()}`, sku: parseStr(item.sku) || `ITEM-${Math.random().toString(36).slice(2, 8)}`, costPrice: item.unitCost });
      productId = created?.id;
    }
    return {
      productId: productId ?? 0,
      productName: parseStr(item.productName) || "Imported item",
      quantity: parseNumber(item.quantity),
      unitCost: parseNumber(item.unitCost),
      total: parseNumber(item.quantity) * parseNumber(item.unitCost),
    };
  }));

  const subtotal = purchaseItems.reduce((sum, item) => sum + item.total, 0);
  const poNumber = parseStr(rawPurchase.poNumber) || `PO-IMP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const purchaseDate = parseDate(rawPurchase.purchaseDate);
  const status = parseStr(rawPurchase.status) || "received";

  try {
    const months = await import("../services/months.service.js");
    if (await months.isDateInClosedPeriod(purchaseDate)) {
      throw new months.MonthClosedError(purchaseDate);
    }
  } catch (err) {
    if (err && (err as Error).name === "MonthClosedError") throw err;
  }

  const insertedPurchase = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(purchasesTable).values({
      poNumber,
      supplierId: supplierRow?.id ?? null,
      supplierName: supplierName || "Imported Supplier",
      status,
      subtotal: String(round2(subtotal)),
      total: String(round2(subtotal)),
      notes: parseStr(rawPurchase.notes) || null,
      items: purchaseItems,
      purchaseDate,
    }).returning();

    if (supplierRow?.id) {
      await appendSupplierLedgerEntry(tx, {
        supplierId: supplierRow.id,
        type: "purchase",
        amount: round2(subtotal),
        purchaseId: inserted.id,
        description: `Imported purchase — ${poNumber}`,
        createdByUserId,
        entryDate: purchaseDate,
      });
      await appendGeneralLedgerEntry(tx, {
        date: purchaseDate,
        type: "purchase",
        referenceId: inserted.id,
        partyType: "supplier",
        partyId: supplierRow.id,
        partyName: supplierName || "Imported Supplier",
        amount: round2(subtotal),
        direction: "debit",
        note: `Imported PO ${poNumber}`,
        createdByUserId,
      });
    }

    if (status === "received") {
      for (const line of purchaseItems) {
        await tx.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} + ${line.quantity}` }).where(eq(productsTable.id, line.productId));
      }
    }

    return inserted;
  });

  return insertedPurchase ? { id: insertedPurchase.id } : null;
}

async function insertSaleRecord(rawSale: Record<string, unknown>, createdByUserId?: number | null): Promise<{ id: number } | null> {
  const customerName = parseStr(rawSale.customerName);
  const customerId = rawSale.customerId ? Number(rawSale.customerId) : undefined;
  const customerRow = customerId
    ? (await db.select({ id: customersTable.id }).from(customersTable).where(eq(customersTable.id, customerId)).limit(1))[0] ?? null
    : customerName
      ? (await db.select({ id: customersTable.id }).from(customersTable).where(eq(customersTable.name, customerName)).limit(1))[0] ?? null
      : null;
  const items = Array.isArray(rawSale.items) ? rawSale.items : [];
  if (!items.length) return null;

  const saleItems = await Promise.all(items.map(async (item: Record<string, unknown>) => {
    const productIdentifier = parseStr(item.sku) || parseStr(item.productName);
    let productId = item.productId ? Number(item.productId) : undefined;
    if (!productId && productIdentifier) {
      const [product] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.sku, productIdentifier));
      productId = product?.id;
    }
    if (!productId && parseStr(item.productName)) {
      const [product] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.name, parseStr(item.productName)));
      productId = product?.id;
    }
    if (!productId) {
      const created = await ensureProduct({ name: parseStr(item.productName) || `Imported item ${Date.now()}`, sku: parseStr(item.sku) || `ITEM-${Math.random().toString(36).slice(2, 8)}`, costPrice: item.unitPrice });
      productId = created?.id;
    }
    return {
      productId: productId ?? 0,
      productName: parseStr(item.productName) || "Imported item",
      quantity: parseNumber(item.quantity),
      unitPrice: parseNumber(item.unitPrice),
      total: parseNumber(item.quantity) * parseNumber(item.unitPrice),
    };
  }));

  const subtotal = saleItems.reduce((sum, item) => sum + item.total, 0);
  const discount = parseNumber(rawSale.discount);
  const total = round2(subtotal - discount);
  const invoiceNumber = parseStr(rawSale.invoiceNumber) || `INV-IMP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const status = parseStr(rawSale.status) || "completed";
  const saleDate = parseDate(rawSale.saleDate);

  try {
    const months = await import("../services/months.service.js");
    if (await months.isDateInClosedPeriod(saleDate)) {
      throw new months.MonthClosedError(saleDate);
    }
  } catch (err) {
    if (err && (err as Error).name === "MonthClosedError") throw err;
  }

  const insertedSale = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(salesTable).values({
      invoiceNumber,
      customerId: customerRow?.id ?? null,
      customerName: customerName || "Imported Customer",
      status,
      subtotal: String(round2(subtotal)),
      discount: String(round2(discount)),
      total: String(total),
      notes: parseStr(rawSale.notes) || null,
      items: saleItems,
      saleDate,
    }).returning();

    if (customerRow?.id && status === "completed") {
      for (const line of saleItems) {
        await tx.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} - ${line.quantity}` }).where(eq(productsTable.id, line.productId));
        await appendLedgerEntry(tx, {
          customerId: customerRow.id,
          type: "sale",
          amount: round2(line.total),
          saleId: inserted.id,
          description: `Imported sale — ${invoiceNumber}`,
          createdByUserId,
          entryDate: saleDate,
        });
      }
      await appendGeneralLedgerEntry(tx, {
        date: saleDate,
        type: "sale",
        referenceId: inserted.id,
        partyType: "customer",
        partyId: customerRow.id,
        partyName: customerName || "Imported Customer",
        amount: total,
        direction: "credit",
        note: `Imported invoice ${invoiceNumber}`,
        createdByUserId,
      });

      await recomputeCustomerLedgerRunningBalances(tx, customerRow.id);
    }

    return inserted;
  });

  return insertedSale ? { id: insertedSale.id } : null;
}

router.post("/legacy", upload.single("file"), async (req, res) => {
  try {
    let payload: Record<string, unknown> = {};
    if (req.file) {
      payload = JSON.parse(req.file.buffer.toString("utf-8"));
    } else if (typeof req.body?.data === "string") {
      payload = JSON.parse(req.body.data);
    } else {
      payload = (req.body as Record<string, unknown>) || {};
    }

    const createdByUserId = getUserIdFromRequest(req);
    const products = Array.isArray(payload.products) ? payload.products : [];
    const customers = Array.isArray(payload.customers) ? payload.customers : [];
    const suppliers = Array.isArray(payload.suppliers) ? payload.suppliers : [];
    const purchases = Array.isArray(payload.purchases) ? payload.purchases : [];
    const sales = Array.isArray(payload.sales) ? payload.sales : [];

    const summary = { importedProducts: 0, importedCustomers: 0, importedSuppliers: 0, importedPurchases: 0, importedSales: 0 };

    for (const rawProduct of products as Array<Record<string, unknown>>) {
      const product = await ensureProduct(rawProduct);
      if (product) summary.importedProducts += product.created ? 1 : 0;
    }

    for (const rawCustomer of customers as Array<Record<string, unknown>>) {
      const customer = await ensureCustomer(rawCustomer);
      if (customer) summary.importedCustomers += customer.created ? 1 : 0;
    }

    for (const rawSupplier of suppliers as Array<Record<string, unknown>>) {
      const supplier = await ensureSupplier(rawSupplier);
      if (supplier) summary.importedSuppliers += supplier.created ? 1 : 0;
    }

    for (const rawPurchase of purchases as Array<Record<string, unknown>>) {
      const inserted = await insertPurchaseRecord(rawPurchase, createdByUserId);
      if (inserted) summary.importedPurchases += 1;
    }

    for (const rawSale of sales as Array<Record<string, unknown>>) {
      const inserted = await insertSaleRecord(rawSale, createdByUserId);
      if (inserted) summary.importedSales += 1;
    }

    return res.json({ success: true, message: "Legacy ERP data imported successfully", ...summary });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Legacy import failed: " + (error as Error).message });
  }
});

// ─── AI IMAGE IMPORT (Groq Vision) ───────────────────────────────────────────
router.post("/ai/image", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });
    if (!getGroqClient()) return res.status(400).json({ error: "GROQ_API_KEY not configured. Please add it in Settings → API Keys." });

    const { importType = "products" } = req.body;
    const base64 = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype || "image/jpeg";

    const prompts: Record<string, string> = {
      products: `Extract ALL product/inventory data from this image. Return ONLY a JSON array like: [{"name":"Product Name","sku":"SKU-001","costPrice":500,"currentStock":100,"unit":"pcs","category":""}]. Extract every product visible. If no clear price, use 0.`,
      customers: `Extract ALL customer/contact data from this image. Return ONLY a JSON array like: [{"name":"Customer Name","phone":"+92...","email":"","city":"Lahore","address":""}]. Extract every person/business visible.`,
      suppliers: `Extract ALL supplier/vendor data from this image. Return ONLY a JSON array like: [{"name":"Supplier Name","contactPerson":"","phone":"+92...","email":"","city":""}].`,
    };

    const aiResponse = await groqVision(base64, mimeType, prompts[importType] || prompts.products);

    // Parse JSON from AI response
    const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return res.json({ imported: 0, message: "AI could not extract structured data from image. Try a clearer image.", preview: aiResponse });

    const extracted = JSON.parse(jsonMatch[0]);
    let count = 0;
    const errors: string[] = [];

    if (importType === "products") {
      for (const item of extracted) {
        try {
          await pool.query(
            `INSERT INTO products (name, sku, cost_price, current_stock, unit) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (sku) DO UPDATE SET name=$1,cost_price=$3,current_stock=$4`,
            [parseStr(item.name), parseStr(item.sku) || `AI-${Date.now()}-${count}`, parseNumber(item.costPrice).toFixed(2), parseInt(item.currentStock) || 0, parseStr(item.unit) || "pcs"]
          );
          count++;
        } catch (e: unknown) { errors.push((e as Error).message); }
      }
    } else if (importType === "customers") {
      for (const item of extracted) {
        try {
          await pool.query(`INSERT INTO customers (name, phone, email, city) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
            [parseStr(item.name), parseStr(item.phone) || null, parseStr(item.email) || null, parseStr(item.city) || null]);
          count++;
        } catch (e: unknown) { errors.push((e as Error).message); }
      }
    } else if (importType === "suppliers") {
      for (const item of extracted) {
        try {
          await pool.query(`INSERT INTO suppliers (name, contact_person, phone, email, city) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
            [parseStr(item.name), parseStr(item.contactPerson) || null, parseStr(item.phone) || null, parseStr(item.email) || null, parseStr(item.city) || null]);
          count++;
        } catch (e: unknown) { errors.push((e as Error).message); }
      }
    }

    return res.json({ imported: count, total: extracted.length, errors: errors.slice(0, 5), preview: extracted.slice(0, 3), message: `AI extracted and imported ${count} ${importType}` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "AI import failed: " + (error as Error).message });
  }
});

// ─── AI DOCUMENT IMPORT (PDF/DOCX/TXT via Groq) ──────────────────────────────
router.post("/ai/document", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    if (!getGroqClient()) return res.status(400).json({ error: "GROQ_API_KEY not configured" });

    const { importType = "products" } = req.body;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const supported = [".txt", ".csv", ".json", ".xml"];

    let textContent = "";

    if (ext === ".txt" || ext === ".csv" || ext === ".json" || ext === ".xml") {
      textContent = req.file.buffer.toString("utf-8");
    } else if (ext === ".pdf") {
      // For PDFs, extract text using buffer (basic extraction)
      textContent = req.file.buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ").substring(0, 8000);
      if (!textContent.trim()) textContent = "[PDF content could not be extracted as text - use image import for scanned PDFs]";
    } else {
      textContent = req.file.buffer.toString("utf-8", 0, Math.min(req.file.buffer.length, 8000)).replace(/[^\x20-\x7E\n\r\t]/g, " ");
    }

    const prompts: Record<string, string> = {
      products: `Extract product/inventory data from this document text. Return ONLY a JSON array: [{"name":"","sku":"","costPrice":0,"currentStock":0,"unit":"pcs","category":""}]\n\nDocument:\n${textContent.substring(0, 6000)}`,
      customers: `Extract customer data from this document. Return ONLY JSON array: [{"name":"","phone":"","email":"","city":"","address":""}]\n\nDocument:\n${textContent.substring(0, 6000)}`,
      suppliers: `Extract supplier/vendor data. Return ONLY JSON array: [{"name":"","contactPerson":"","phone":"","email":"","city":""}]\n\nDocument:\n${textContent.substring(0, 6000)}`,
      expenses: `Extract expense data. Return ONLY JSON array: [{"title":"","amount":0,"category":"","date":""}]\n\nDocument:\n${textContent.substring(0, 6000)}`,
    };

    const aiResponse = await groqChat([
      { role: "system", content: "You are a data extraction assistant for a Pakistani wholesale business ERP. Extract structured data and return ONLY valid JSON arrays. No explanation, no markdown, just the JSON array." },
      { role: "user", content: prompts[importType] || prompts.products },
    ]);

    const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return res.json({ imported: 0, message: "Could not extract data from document", preview: aiResponse.substring(0, 500) });

    const extracted = JSON.parse(jsonMatch[0]);
    let count = 0;
    const errors: string[] = [];

    if (importType === "products") {
      for (const item of extracted) {
        try {
          await pool.query(
            `INSERT INTO products (name, sku, cost_price, current_stock, unit) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (sku) DO UPDATE SET name=$1,cost_price=$3`,
            [parseStr(item.name) || "Unknown", parseStr(item.sku) || `DOC${Date.now()}${count}`, parseNumber(item.costPrice).toFixed(2), parseInt(item.currentStock) || 0, parseStr(item.unit) || "pcs"]
          );
          count++;
        } catch (e: unknown) { errors.push((e as Error).message); }
      }
    } else if (importType === "customers") {
      for (const item of extracted) {
        if (!item.name) continue;
        try {
          await pool.query(`INSERT INTO customers (name, phone, email, city) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
            [parseStr(item.name), parseStr(item.phone) || null, parseStr(item.email) || null, parseStr(item.city) || null]);
          count++;
        } catch (e: unknown) { errors.push((e as Error).message); }
      }
    } else if (importType === "expenses") {
      for (const item of extracted) {
        try {
          await pool.query(`INSERT INTO expenses (title, amount, category) VALUES ($1,$2,$3)`,
            [parseStr(item.title) || "Imported", parseNumber(item.amount).toFixed(2), parseStr(item.category) || "General"]);
          count++;
        } catch (e: unknown) { errors.push((e as Error).message); }
      }
    }

    return res.json({ imported: count, total: extracted.length, errors: errors.slice(0, 5), preview: extracted.slice(0, 3), message: `Imported ${count} ${importType} from document` });
  } catch (error) {
    return res.status(500).json({ error: "AI document import failed: " + (error as Error).message });
  }
});

// ─── EXCEL/CSV PRODUCTS IMPORT ────────────────────────────────────────────────
router.post("/products", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const wb = new ExcelJS.Workbook();
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext === ".csv") {
      const ws = wb.addWorksheet("Sheet1");
      const rows = req.file.buffer.toString("utf-8").split(/\r?\n/).filter(Boolean);
      for (const row of rows) ws.addRow(row.split(",").map(c => c.trim().replace(/^"|"$/g, "")));
    } else {
      await wb.xlsx.load(req.file.buffer as any);
    }
    const ws = wb.worksheets[0];
    if (!ws) return res.status(400).json({ error: "No worksheet found" });
    const headers: string[] = [];
    ws.getRow(1).eachCell(cell => headers.push(parseStr(cell.value).toLowerCase().replace(/\s+/g, "_")));
    const getIdx = (...names: string[]) => { for (const n of names) { const i = headers.indexOf(n); if (i >= 0) return i; } return -1; };
    const nameIdx = getIdx("name", "product_name", "product", "item");
    const skuIdx = getIdx("sku", "code", "item_code", "product_code");
    const costIdx = getIdx("cost_price", "cost", "purchase_price", "buying_price", "cp");
    const saleIdx = getIdx("sale_price", "selling_price", "price", "mrp", "sp");
    const stockIdx = getIdx("current_stock", "stock", "quantity", "qty", "balance");
    const minIdx = getIdx("min_stock", "minimum_stock", "reorder", "reorder_level");
    const unitIdx = getIdx("unit", "uom", "unit_of_measure");
    if (nameIdx < 0) return res.status(400).json({ error: "Name column not found. Expected: name, product_name, item" });
    const imported: string[] = []; const errors: string[] = [];
    ws.eachRow(async (row, rn) => {
      if (rn === 1) return;
      const cells: unknown[] = []; row.eachCell({ includeEmpty: true }, c => cells.push(c.value));
      const name = parseStr(cells[nameIdx]);
      if (!name) return;
      const sku = skuIdx >= 0 ? parseStr(cells[skuIdx]) : `IMP-${Date.now()}-${rn}`;
      const hasSaleCol = saleIdx >= 0 && parseStr(cells[saleIdx]) !== "";
      try {
        if (hasSaleCol) {
          await pool.query(`INSERT INTO products (name,sku,cost_price,sale_price,current_stock,min_stock,unit) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (sku) DO UPDATE SET name=$1,cost_price=$3,sale_price=$4,current_stock=$5,min_stock=$6`,
            [name, sku || `IMP${rn}`, parseNumber(costIdx >= 0 ? cells[costIdx] : 0).toFixed(2), parseNumber(cells[saleIdx]).toFixed(2), parseInt(String(stockIdx >= 0 ? cells[stockIdx] : 0)) || 0, parseInt(String(minIdx >= 0 ? cells[minIdx] : 5)) || 5, parseStr(unitIdx >= 0 ? cells[unitIdx] : "pcs") || "pcs"]);
        } else {
          await pool.query(`INSERT INTO products (name,sku,cost_price,current_stock,min_stock,unit) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (sku) DO UPDATE SET name=$1,cost_price=$3,current_stock=$4,min_stock=$5`,
            [name, sku || `IMP${rn}`, parseNumber(costIdx >= 0 ? cells[costIdx] : 0).toFixed(2), parseInt(String(stockIdx >= 0 ? cells[stockIdx] : 0)) || 0, parseInt(String(minIdx >= 0 ? cells[minIdx] : 5)) || 5, parseStr(unitIdx >= 0 ? cells[unitIdx] : "pcs") || "pcs"]);
        }
        imported.push(name);
      } catch (e: unknown) { errors.push(`Row ${rn}: ${(e as Error).message}`); }
    });
    await new Promise(r => setTimeout(r, 300));
    return res.json({ imported: imported.length, errors, message: `Imported ${imported.length} products` });
  } catch (error) {
    return res.status(500).json({ error: "Import failed: " + (error as Error).message });
  }
});

// ─── CUSTOMERS IMPORT ─────────────────────────────────────────────────────────
router.post("/customers", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const wb = new ExcelJS.Workbook();
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext === ".csv") {
      const ws = wb.addWorksheet("S"); const rows = req.file.buffer.toString("utf-8").split(/\r?\n/).filter(Boolean);
      for (const row of rows) ws.addRow(row.split(",").map(c => c.trim().replace(/^"|"$/g, "")));
    } else { await wb.xlsx.load(req.file.buffer as any); }
    const ws = wb.worksheets[0];
    const headers: string[] = [];
    ws.getRow(1).eachCell(c => headers.push(parseStr(c.value).toLowerCase().replace(/\s+/g, "_")));
    const ni = Math.max(headers.indexOf("name"), headers.indexOf("customer_name"), headers.indexOf("customer"), headers.indexOf("company"));
    if (ni < 0) return res.status(400).json({ error: "Name column not found" });
    const pi = Math.max(headers.indexOf("phone"), headers.indexOf("mobile"), headers.indexOf("contact"));
    const ei = Math.max(headers.indexOf("email"), headers.indexOf("email_address"));
    const ci = Math.max(headers.indexOf("city"), headers.indexOf("location"));
    let count = 0;
    ws.eachRow(async (row, rn) => {
      if (rn === 1) return;
      const cells: unknown[] = []; row.eachCell({ includeEmpty: true }, c => cells.push(c.value));
      const name = parseStr(cells[ni]); if (!name) return;
      await pool.query(`INSERT INTO customers (name,phone,email,city) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [name, pi >= 0 ? parseStr(cells[pi]) || null : null, ei >= 0 ? parseStr(cells[ei]) || null : null, ci >= 0 ? parseStr(cells[ci]) || null : null]);
      count++;
    });
    await new Promise(r => setTimeout(r, 200));
    return res.json({ imported: count, message: `Imported ${count} customers` });
  } catch (error) { return res.status(500).json({ error: "Import failed" }); }
});


// ─── SMART IMPORT (one Excel/CSV file → AI detects & routes rows into ────────
// products / customers / suppliers / purchases / sales / expenses, no matter
// which tab the import was triggered from) ────────────────────────────────────

type SmartEntityType = "products" | "customers" | "suppliers" | "purchases" | "sales" | "expenses" | "unknown";

const CANONICAL_FIELDS: Record<Exclude<SmartEntityType, "unknown">, string[]> = {
  products: ["name", "sku", "costPrice", "salePrice", "currentStock", "minStock", "unit"],
  customers: ["name", "phone", "email", "address", "city", "type", "openingBalance", "creditLimit"],
  suppliers: ["name", "phone", "email", "address", "city", "contactPerson", "openingBalance"],
  purchases: ["poNumber", "supplierName", "purchaseDate", "status", "notes", "productName", "sku", "quantity", "unitCost"],
  sales: ["invoiceNumber", "customerName", "saleDate", "status", "notes", "discount", "productName", "sku", "quantity", "unitPrice"],
  expenses: ["title", "category", "amount", "date", "notes"],
};

async function loadWorkbookSheets(buffer: Buffer, originalName: string): Promise<Array<{ sheetName: string; headers: string[]; rows: unknown[][] }>> {
  const ext = path.extname(originalName).toLowerCase();
  const wb = new ExcelJS.Workbook();
  if (ext === ".csv") {
    const ws = wb.addWorksheet("Sheet1");
    const csvRows = buffer.toString("utf-8").split(/\r?\n/).filter(r => r.trim().length > 0);
    for (const row of csvRows) ws.addRow(row.split(",").map(c => c.trim().replace(/^"|"$/g, "")));
  } else {
    await wb.xlsx.load(buffer as any);
  }

  const sheets: Array<{ sheetName: string; headers: string[]; rows: unknown[][] }> = [];
  for (const ws of wb.worksheets) {
    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, cell => headers.push(parseStr(cell.value)));
    if (!headers.some(h => h)) continue;

    const rows: unknown[][] = [];
    ws.eachRow((row, rn) => {
      if (rn === 1) return;
      const cells: unknown[] = [];
      row.eachCell({ includeEmpty: true }, cell => {
        const v = cell.value as any;
        cells.push(v && typeof v === "object" && "text" in v ? v.text : v && typeof v === "object" && "result" in v ? v.result : v);
      });
      if (cells.some(c => parseStr(c) !== "")) rows.push(cells);
    });
    if (rows.length) sheets.push({ sheetName: ws.name, headers, rows });
  }
  return sheets;
}

/** Ask the AI what a sheet represents and how its columns map to our canonical
 *  fields. We only send headers + a few sample rows (cheap & fast), then apply
 *  the returned mapping to every row locally — this scales to large sheets
 *  without hitting AI token/row limits. Falls back to keyword heuristics if
 *  no AI key is configured or the AI response can't be parsed. */
async function classifySheet(sheetName: string, headers: string[], sampleRows: unknown[][]): Promise<{ entityType: SmartEntityType; columnMap: Record<string, number> }> {
  const heuristic = heuristicClassify(sheetName, headers);

  if (!getGroqClient()) return heuristic;

  try {
    const sample = sampleRows.slice(0, 3).map(r => headers.map((h, i) => `${h}: ${parseStr(r[i])}`).join(" | "));
    const prompt = `You are analyzing one sheet of a business Excel/CSV file for a Pakistani wholesale ERP (products, customers, suppliers, purchases, sales, expenses).

Sheet name: "${sheetName}"
Columns (in order, index starting at 0): ${headers.map((h, i) => `${i}:"${h}"`).join(", ")}
Sample rows:
${sample.join("\n")}

Decide which ONE entity type this sheet's rows represent: "products", "customers", "suppliers", "purchases", "sales", "expenses", or "unknown" if unclear.
Then map each relevant canonical field to the COLUMN INDEX (number) that holds it, using this field list per type:
- products: name, sku, costPrice, salePrice, currentStock, minStock, unit
- customers: name, phone, email, address, city, type, openingBalance, creditLimit
- suppliers: name, phone, email, address, city, contactPerson, openingBalance
- purchases: poNumber, supplierName, purchaseDate, status, notes, productName, sku, quantity, unitCost
- sales: invoiceNumber, customerName, saleDate, status, notes, discount, productName, sku, quantity, unitPrice
- expenses: title, category, amount, date, notes

Return ONLY JSON, no explanation, no markdown: {"entityType":"...","columnMap":{"field":columnIndex,...}}
Only include fields you are confident are present. Omit fields that don't have a matching column.`;

    const response = await groqChat([
      { role: "system", content: "You classify spreadsheet data for an ERP importer and reply with strict JSON only." },
      { role: "user", content: prompt },
    ]);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return heuristic;
    const parsed = JSON.parse(jsonMatch[0]);
    const entityType: SmartEntityType = ["products", "customers", "suppliers", "purchases", "sales", "expenses"].includes(parsed.entityType) ? parsed.entityType : "unknown";
    if (entityType === "unknown") return heuristic;
    const columnMap: Record<string, number> = {};
    for (const [field, idx] of Object.entries(parsed.columnMap || {})) {
      if (typeof idx === "number" && idx >= 0 && idx < headers.length) columnMap[field] = idx;
    }
    // If AI returned an entity type but almost no usable columns, prefer heuristic.
    if (Object.keys(columnMap).length === 0) return heuristic;
    return { entityType, columnMap };
  } catch {
    return heuristic;
  }
}

/** Deterministic fallback classification by header keywords — used when no
 *  GROQ_API_KEY is configured, or the AI call fails, so smart import always
 *  works even without AI. */
function heuristicClassify(sheetName: string, headers: string[]): { entityType: SmartEntityType; columnMap: Record<string, number> } {
  const norm = headers.map(h => h.toLowerCase().replace(/\s+/g, "_"));
  const find = (...names: string[]) => { for (const n of names) { const i = norm.indexOf(n); if (i >= 0) return i; } return -1; };
  const nameHint = sheetName.toLowerCase();

  const has = (i: number) => i >= 0;

  const invoiceIdx = find("invoice_number", "invoice", "invoice_no");
  const poIdx = find("po_number", "po", "purchase_order", "po_no");
  const qtyIdx = find("quantity", "qty");
  const customerIdx = find("customer_name", "customer");
  const supplierIdx = find("supplier_name", "supplier", "vendor");
  const amountIdx = find("amount", "total");
  const titleIdx = find("title", "expense_title", "description");
  const categoryIdx = find("category", "expense_category");

  if (has(invoiceIdx) || nameHint.includes("sale") || (has(customerIdx) && has(qtyIdx))) {
    const map: Record<string, number> = {};
    if (has(invoiceIdx)) map.invoiceNumber = invoiceIdx;
    if (has(customerIdx)) map.customerName = customerIdx;
    const dateIdx = find("sale_date", "date"); if (has(dateIdx)) map.saleDate = dateIdx;
    const statusIdx = find("status"); if (has(statusIdx)) map.status = statusIdx;
    const notesIdx = find("notes", "remarks"); if (has(notesIdx)) map.notes = notesIdx;
    const discIdx = find("discount"); if (has(discIdx)) map.discount = discIdx;
    const pNameIdx = find("product_name", "product", "item"); if (has(pNameIdx)) map.productName = pNameIdx;
    const skuIdx = find("sku", "code"); if (has(skuIdx)) map.sku = skuIdx;
    if (has(qtyIdx)) map.quantity = qtyIdx;
    const priceIdx = find("unit_price", "price", "sale_price", "selling_price"); if (has(priceIdx)) map.unitPrice = priceIdx;
    return { entityType: "sales", columnMap: map };
  }

  if (has(poIdx) || nameHint.includes("purchase") || (has(supplierIdx) && has(qtyIdx))) {
    const map: Record<string, number> = {};
    if (has(poIdx)) map.poNumber = poIdx;
    if (has(supplierIdx)) map.supplierName = supplierIdx;
    const dateIdx = find("purchase_date", "date"); if (has(dateIdx)) map.purchaseDate = dateIdx;
    const statusIdx = find("status"); if (has(statusIdx)) map.status = statusIdx;
    const notesIdx = find("notes", "remarks"); if (has(notesIdx)) map.notes = notesIdx;
    const pNameIdx = find("product_name", "product", "item"); if (has(pNameIdx)) map.productName = pNameIdx;
    const skuIdx = find("sku", "code"); if (has(skuIdx)) map.sku = skuIdx;
    if (has(qtyIdx)) map.quantity = qtyIdx;
    const costIdx = find("unit_cost", "cost", "cost_price", "purchase_price"); if (has(costIdx)) map.unitCost = costIdx;
    return { entityType: "purchases", columnMap: map };
  }

  if ((has(titleIdx) && has(amountIdx) && has(categoryIdx)) || nameHint.includes("expense")) {
    const map: Record<string, number> = {};
    if (has(titleIdx)) map.title = titleIdx;
    if (has(categoryIdx)) map.category = categoryIdx;
    if (has(amountIdx)) map.amount = amountIdx;
    const dateIdx = find("date", "expense_date"); if (has(dateIdx)) map.date = dateIdx;
    const notesIdx = find("notes", "remarks"); if (has(notesIdx)) map.notes = notesIdx;
    return { entityType: "expenses", columnMap: map };
  }

  const skuOrCostIdx = find("sku", "cost_price", "cost", "current_stock", "stock");
  if (has(skuOrCostIdx) || nameHint.includes("product") || nameHint.includes("inventory") || nameHint.includes("stock")) {
    const map: Record<string, number> = {};
    const nIdx = find("name", "product_name", "product", "item"); if (has(nIdx)) map.name = nIdx;
    const skuIdx = find("sku", "code", "item_code"); if (has(skuIdx)) map.sku = skuIdx;
    const costIdx = find("cost_price", "cost", "purchase_price", "buying_price"); if (has(costIdx)) map.costPrice = costIdx;
    const saleIdx = find("sale_price", "selling_price", "price", "mrp"); if (has(saleIdx)) map.salePrice = saleIdx;
    const stockIdx = find("current_stock", "stock", "quantity", "qty"); if (has(stockIdx)) map.currentStock = stockIdx;
    const minIdx = find("min_stock", "reorder_level"); if (has(minIdx)) map.minStock = minIdx;
    const unitIdx = find("unit", "uom"); if (has(unitIdx)) map.unit = unitIdx;
    return { entityType: "products", columnMap: map };
  }

  if (nameHint.includes("supplier") || nameHint.includes("vendor")) {
    const map: Record<string, number> = {};
    const nIdx = find("name", "supplier_name", "vendor"); if (has(nIdx)) map.name = nIdx;
    const phoneIdx = find("phone", "mobile", "contact"); if (has(phoneIdx)) map.phone = phoneIdx;
    const emailIdx = find("email"); if (has(emailIdx)) map.email = emailIdx;
    const cityIdx = find("city", "location"); if (has(cityIdx)) map.city = cityIdx;
    const cpIdx = find("contact_person"); if (has(cpIdx)) map.contactPerson = cpIdx;
    return { entityType: "suppliers", columnMap: map };
  }

  const nIdx = find("name", "customer_name", "customer", "company");
  if (has(nIdx)) {
    const map: Record<string, number> = { name: nIdx };
    const phoneIdx = find("phone", "mobile", "contact"); if (has(phoneIdx)) map.phone = phoneIdx;
    const emailIdx = find("email"); if (has(emailIdx)) map.email = emailIdx;
    const cityIdx = find("city", "location"); if (has(cityIdx)) map.city = cityIdx;
    const addrIdx = find("address"); if (has(addrIdx)) map.address = addrIdx;
    return { entityType: "customers", columnMap: map };
  }

  return { entityType: "unknown", columnMap: {} };
}

function rowToRecord(headers: string[], row: unknown[], columnMap: Record<string, number>): Record<string, unknown> {
  const rec: Record<string, unknown> = {};
  for (const [field, idx] of Object.entries(columnMap)) rec[field] = row[idx];
  return rec;
}

export const smartImportRouter = Router();

smartImportRouter.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const createdByUserId = getUserIdFromRequest(req);

    const sheets = await loadWorkbookSheets(req.file.buffer, req.file.originalname);
    if (!sheets.length) return res.status(400).json({ error: "File mein koi data nahi mila" });

    const summary = { importedProducts: 0, importedCustomers: 0, importedSuppliers: 0, importedPurchases: 0, importedSales: 0, importedExpenses: 0 };
    const skippedSheets: string[] = [];
    const errors: string[] = [];

    for (const sheet of sheets) {
      const { entityType, columnMap } = await classifySheet(sheet.sheetName, sheet.headers, sheet.rows.slice(0, 3));

      if (entityType === "unknown" || Object.keys(columnMap).length === 0) {
        skippedSheets.push(sheet.sheetName);
        continue;
      }

      if (entityType === "products") {
        for (const row of sheet.rows) {
          try {
            const rec = rowToRecord(sheet.headers, row, columnMap);
            if (!parseStr(rec.name)) continue;
            const result = await ensureProduct(rec);
            if (result) summary.importedProducts++;
          } catch (e) { errors.push(`${sheet.sheetName}: ${(e as Error).message}`); }
        }
      } else if (entityType === "customers") {
        for (const row of sheet.rows) {
          try {
            const rec = rowToRecord(sheet.headers, row, columnMap);
            if (!parseStr(rec.name)) continue;
            const result = await ensureCustomer(rec);
            if (result) summary.importedCustomers++;
          } catch (e) { errors.push(`${sheet.sheetName}: ${(e as Error).message}`); }
        }
      } else if (entityType === "suppliers") {
        for (const row of sheet.rows) {
          try {
            const rec = rowToRecord(sheet.headers, row, columnMap);
            if (!parseStr(rec.name)) continue;
            const result = await ensureSupplier(rec);
            if (result) summary.importedSuppliers++;
          } catch (e) { errors.push(`${sheet.sheetName}: ${(e as Error).message}`); }
        }
      } else if (entityType === "expenses") {
        for (const row of sheet.rows) {
          try {
            const rec = rowToRecord(sheet.headers, row, columnMap);
            if (!parseStr(rec.title) || !parseNumber(rec.amount)) continue;
            const result = await ensureExpense(rec, createdByUserId);
            if (result) summary.importedExpenses++;
          } catch (e) { errors.push(`${sheet.sheetName}: ${(e as Error).message}`); }
        }
      } else if (entityType === "purchases") {
        // Group rows into one purchase per PO number (rows sharing the same
        // PO become line items of the same purchase); rows without a PO
        // number each become their own single-line purchase.
        const groups = new Map<string, Record<string, unknown>[]>();
        for (const row of sheet.rows) {
          const rec = rowToRecord(sheet.headers, row, columnMap);
          if (!parseStr(rec.productName) && !parseStr(rec.sku)) continue;
          const key = parseStr(rec.poNumber) || `__row_${groups.size}_${Math.random()}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(rec);
        }
        for (const [poNumber, lines] of groups) {
          try {
            const first = lines[0];
            const rawPurchase: Record<string, unknown> = {
              poNumber: parseStr(first.poNumber) || undefined,
              supplierName: first.supplierName,
              purchaseDate: first.purchaseDate,
              status: first.status,
              notes: first.notes,
              items: lines.map(l => ({ productName: l.productName, sku: l.sku, quantity: l.quantity, unitCost: l.unitCost })),
            };
            const result = await insertPurchaseRecord(rawPurchase, createdByUserId);
            if (result) summary.importedPurchases++;
          } catch (e) { errors.push(`${sheet.sheetName} (PO ${poNumber}): ${(e as Error).message}`); }
        }
      } else if (entityType === "sales") {
        const groups = new Map<string, Record<string, unknown>[]>();
        for (const row of sheet.rows) {
          const rec = rowToRecord(sheet.headers, row, columnMap);
          if (!parseStr(rec.productName) && !parseStr(rec.sku)) continue;
          const key = parseStr(rec.invoiceNumber) || `__row_${groups.size}_${Math.random()}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(rec);
        }
        for (const [invoiceNumber, lines] of groups) {
          try {
            const first = lines[0];
            const rawSale: Record<string, unknown> = {
              invoiceNumber: parseStr(first.invoiceNumber) || undefined,
              customerName: first.customerName,
              saleDate: first.saleDate,
              status: first.status,
              notes: first.notes,
              discount: first.discount,
              items: lines.map(l => ({ productName: l.productName, sku: l.sku, quantity: l.quantity, unitPrice: l.unitPrice })),
            };
            const result = await insertSaleRecord(rawSale, createdByUserId);
            if (result) summary.importedSales++;
          } catch (e) { errors.push(`${sheet.sheetName} (Invoice ${invoiceNumber}): ${(e as Error).message}`); }
        }
      }
    }

    const totalImported = summary.importedProducts + summary.importedCustomers + summary.importedSuppliers + summary.importedPurchases + summary.importedSales + summary.importedExpenses;

    return res.json({
      success: true,
      message: totalImported > 0
        ? `${totalImported} records import ho gaye — Products: ${summary.importedProducts}, Customers: ${summary.importedCustomers}, Suppliers: ${summary.importedSuppliers}, Purchases: ${summary.importedPurchases}, Sales: ${summary.importedSales}, Expenses: ${summary.importedExpenses}`
        : "Koi data import nahi ho saka — file ke columns pehchane nahi ja sake.",
      ...summary,
      sheetsProcessed: sheets.length,
      skippedSheets,
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    console.error("smart import failed", error);
    if (error && (error as Error).name === "MonthClosedError") {
      return res.status(409).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: "Smart import failed: " + (error as Error).message });
  }
});

export default router;
