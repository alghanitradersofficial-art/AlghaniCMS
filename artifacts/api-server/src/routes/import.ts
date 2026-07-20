import { Router } from "express";
import { pool, db, productsTable, customersTable, suppliersTable, purchasesTable, salesTable } from "@workspace/db";
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
      const supplierName = parseStr(rawPurchase.supplierName);
      const supplierId = rawPurchase.supplierId ? Number(rawPurchase.supplierId) : undefined;
      const supplierRow = supplierId
        ? (await db.select({ id: suppliersTable.id }).from(suppliersTable).where(eq(suppliersTable.id, supplierId)).limit(1))[0] ?? null
        : supplierName
          ? (await db.select({ id: suppliersTable.id }).from(suppliersTable).where(eq(suppliersTable.name, supplierName)).limit(1))[0] ?? null
          : null;
      const items = Array.isArray(rawPurchase.items) ? rawPurchase.items : [];
      if (!items.length) continue;

      const purchaseItems = await Promise.all(items.map(async (item: Record<string, unknown>) => {
        const productIdentifier = parseStr(item.sku) || parseStr(item.productName);
        let productId = item.productId ? Number(item.productId) : undefined;
        if (!productId && productIdentifier) {
          const [product] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.sku, productIdentifier));
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
      const poNumber = parseStr(rawPurchase.poNumber) || `PO-LEGACY-${Date.now()}-${summary.importedPurchases + 1}`;
      const purchaseDate = parseDate(rawPurchase.purchaseDate);
      const status = parseStr(rawPurchase.status) || "received";

      // prevent importing purchases into closed financial periods
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

      if (insertedPurchase) summary.importedPurchases += 1;
    }

    for (const rawSale of sales as Array<Record<string, unknown>>) {
      const customerName = parseStr(rawSale.customerName);
      const customerId = rawSale.customerId ? Number(rawSale.customerId) : undefined;
      const customerRow = customerId
        ? (await db.select({ id: customersTable.id }).from(customersTable).where(eq(customersTable.id, customerId)).limit(1))[0] ?? null
        : customerName
          ? (await db.select({ id: customersTable.id }).from(customersTable).where(eq(customersTable.name, customerName)).limit(1))[0] ?? null
          : null;
      const items = Array.isArray(rawSale.items) ? rawSale.items : [];
      if (!items.length) continue;

      const saleItems = await Promise.all(items.map(async (item: Record<string, unknown>) => {
        const productIdentifier = parseStr(item.sku) || parseStr(item.productName);
        let productId = item.productId ? Number(item.productId) : undefined;
        if (!productId && productIdentifier) {
          const [product] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.sku, productIdentifier));
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
      const invoiceNumber = parseStr(rawSale.invoiceNumber) || `INV-LEGACY-${Date.now()}-${summary.importedSales + 1}`;
      const status = parseStr(rawSale.status) || "completed";
      const saleDate = parseDate(rawSale.saleDate);

      // prevent importing sales into closed financial periods
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

          // Imported rows are frequently inserted out of chronological order,
          // so re-chain running balances by entryDate rather than trusting
          // insertion order.
          await recomputeCustomerLedgerRunningBalances(tx, customerRow.id);
        }

        return inserted;
      });

      if (insertedSale) summary.importedSales += 1;
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


// ─── AI EXCEL IMPORT (works for ANY sheet layout, ANY tab) ───────────────────
//
// Person uploads any Excel/CSV — column names, order, and even which sheet
// (Sales, Purchases, Customers, Suppliers, Products) can be totally messy or
// "basic". We:
//   1. Parse the workbook into raw rows (headers + data), no assumptions.
//   2. Send the headers + a sample of rows to Groq AI and ask it to (a) figure
//      out what kind of records this sheet contains, and (b) return a column
//      mapping from OUR field names -> the sheet's actual header text.
//   3. Re-read the ENTIRE sheet using that mapping (not just the sample), and
//      insert rows one by one, in order, into the correct table — creating
//      missing products/customers/suppliers along the way, and updating
//      stock + ledgers exactly like the manual entry / legacy-import paths do.
//   4. Return a clear summary (+ any row-level errors) for the person to see.

type ImportKind = "sales" | "purchases" | "customers" | "suppliers" | "products";

const IMPORT_KIND_FIELDS: Record<ImportKind, string[]> = {
  customers: ["name", "phone", "email", "address", "city", "type", "openingBalance", "creditLimit"],
  suppliers: ["name", "phone", "email", "address", "city", "contactPerson", "openingBalance"],
  products: ["name", "sku", "costPrice", "salePrice", "currentStock", "minStock", "unit"],
  sales: ["invoiceNumber", "customerName", "productName", "sku", "quantity", "unitPrice", "discount", "status", "saleDate", "notes"],
  purchases: ["poNumber", "supplierName", "productName", "sku", "quantity", "unitCost", "status", "purchaseDate", "notes"],
};

function sheetToRows(buffer: Buffer, filename: string): { headers: string[]; rows: string[][] } {
  const ext = path.extname(filename).toLowerCase();
  const wb = new ExcelJS.Workbook();
  if (ext === ".csv") {
    const ws = wb.addWorksheet("Sheet1");
    // Basic CSV split that still respects quoted commas.
    const lines = buffer.toString("utf-8").split(/\r?\n/).filter(l => l.trim().length > 0);
    for (const line of lines) {
      const cells: string[] = [];
      let cur = ""; let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuotes = !inQuotes; continue; }
        if (ch === "," && !inQuotes) { cells.push(cur.trim()); cur = ""; continue; }
        cur += ch;
      }
      cells.push(cur.trim());
      ws.addRow(cells);
    }
    return extractRows(ws);
  }
  return { headers: [], rows: [] }; // filled in by caller after async xlsx load
}

function extractRows(ws: ExcelJS.Worksheet): { headers: string[]; rows: string[][] } {
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, cell => headers.push(parseStr(cell.value)));
  const rows: string[][] = [];
  ws.eachRow((row, rn) => {
    if (rn === 1) return;
    const cells: string[] = [];
    for (let i = 1; i <= headers.length; i++) {
      const cell = row.getCell(i);
      let val = cell.value;
      if (val && typeof val === "object" && "text" in (val as any)) val = (val as any).text;
      if (val && typeof val === "object" && "result" in (val as any)) val = (val as any).result;
      cells.push(parseStr(val));
    }
    if (cells.some(c => c !== "")) rows.push(cells);
  });
  return { headers, rows };
}

async function loadWorkbookRows(buffer: Buffer, filename: string): Promise<{ headers: string[]; rows: string[][] }> {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".csv") return sheetToRows(buffer, filename);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  return extractRows(ws);
}

// Ask the AI to identify the sheet type + map our canonical fields to the
// sheet's real headers, using only the header row + a handful of sample rows
// (keeps the prompt small and fast even for huge sheets).
async function detectMappingWithAI(headers: string[], sampleRows: string[][], hint?: ImportKind): Promise<{ kind: ImportKind; mapping: Record<string, string | null>; confidence: string }> {
  const sample = sampleRows.slice(0, 15).map(r => headers.map((h, i) => `${h}: ${r[i] ?? ""}`).join(" | ")).join("\n");
  const kindList = Object.keys(IMPORT_KIND_FIELDS).join(", ");
  const fieldsDoc = Object.entries(IMPORT_KIND_FIELDS).map(([k, fields]) => `- ${k}: ${fields.join(", ")}`).join("\n");

  const prompt = `You are analyzing an uploaded Excel/CSV sheet for a Pakistani wholesale ERP system (products, customers, suppliers, sales, purchases). The sheet may use messy, abbreviated, Urdu/English mixed, or non-standard column names, and columns may be in any order.

Sheet headers (in order): ${JSON.stringify(headers)}

Sample rows:
${sample}

${hint ? `The person told us this sheet is for: "${hint}". Trust this unless the data clearly contradicts it.` : ""}

Possible sheet types and their canonical fields:
${fieldsDoc}

Decide which ONE type (${kindList}) this sheet best matches, then map EVERY canonical field for that type to the EXACT matching header string from the sheet's header list above (copy it exactly, character for character), or null if no column matches.

Notes:
- For sales/purchases sheets, one row usually = one line item (product + qty + price) possibly repeated under the same invoice/PO number — that's fine, we handle grouping.
- If the sheet has no explicit invoiceNumber/poNumber column, map it to null; we will auto-generate one per row or group.
- If quantity/price columns are missing for a sales/purchases sheet but the sheet is clearly just a customer or product list, re-classify accordingly.

Return ONLY valid JSON, no markdown, in this exact shape:
{"kind":"sales|purchases|customers|suppliers|products","confidence":"high|medium|low","mapping":{"fieldName":"exact header or null", ...}}`;

  const aiResponse = await groqChat([
    { role: "system", content: "You are a precise data-mapping assistant. You only respond with valid JSON, never prose, never markdown fences." },
    { role: "user", content: prompt },
  ]);

  const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI could not analyze this sheet's structure. Try a clearer file.");
  const parsed = JSON.parse(jsonMatch[0]);
  const kind: ImportKind = IMPORT_KIND_FIELDS[parsed.kind as ImportKind] ? parsed.kind : (hint || "products");
  const mapping: Record<string, string | null> = {};
  for (const field of IMPORT_KIND_FIELDS[kind]) {
    const mapped = parsed.mapping?.[field];
    mapping[field] = typeof mapped === "string" && headers.includes(mapped) ? mapped : null;
  }
  return { kind, mapping, confidence: parsed.confidence || "medium" };
}

function buildRowGetter(headers: string[], mapping: Record<string, string | null>) {
  const indexOf: Record<string, number> = {};
  for (const [field, header] of Object.entries(mapping)) {
    indexOf[field] = header ? headers.indexOf(header) : -1;
  }
  return (row: string[], field: string): string => {
    const idx = indexOf[field];
    return idx >= 0 && idx < row.length ? row[idx] : "";
  };
}

// POST /api/import/ai/excel
// form fields: file (required), importType (optional hint: sales|purchases|customers|suppliers|products), preview ("true" to only analyze, not write)
router.post("/ai/excel", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    if (!getGroqClient()) return res.status(400).json({ error: "GROQ_API_KEY not configured. Please add it in Settings → API Keys." });

    const hint = (req.body?.importType || "") as ImportKind | "";
    const previewOnly = req.body?.preview === "true";
    const createdByUserId = getUserIdFromRequest(req);

    const { headers, rows } = await loadWorkbookRows(req.file.buffer, req.file.originalname);
    if (!headers.length || !rows.length) {
      return res.status(400).json({ error: "Could not read any data from this file. Make sure the first row has column headers." });
    }

    const { kind, mapping, confidence } = await detectMappingWithAI(headers, rows, hint || undefined);
    const get = buildRowGetter(headers, mapping);

    if (previewOnly) {
      return res.json({
        kind, mapping, confidence,
        rowCount: rows.length,
        sample: rows.slice(0, 5).map(r => {
          const obj: Record<string, string> = {};
          for (const field of IMPORT_KIND_FIELDS[kind]) obj[field] = get(r, field);
          return obj;
        }),
      });
    }

    const summary = { kind, confidence, totalRows: rows.length, imported: 0, updated: 0, skipped: 0, errors: [] as string[] };

    if (kind === "products") {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const name = get(row, "name");
        if (!name) { summary.skipped++; continue; }
        try {
          const result = await ensureProduct({
            name, sku: get(row, "sku"), costPrice: get(row, "costPrice"), salePrice: get(row, "salePrice") || undefined,
            currentStock: get(row, "currentStock"), minStock: get(row, "minStock"), unit: get(row, "unit"),
          });
          if (result) result.created ? summary.imported++ : summary.updated++;
        } catch (e) { summary.errors.push(`Row ${i + 2}: ${(e as Error).message}`); }
      }
    } else if (kind === "customers") {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const name = get(row, "name");
        if (!name) { summary.skipped++; continue; }
        try {
          const result = await ensureCustomer({
            name, phone: get(row, "phone"), email: get(row, "email"), address: get(row, "address"),
            city: get(row, "city"), type: get(row, "type"), openingBalance: get(row, "openingBalance"), creditLimit: get(row, "creditLimit"),
          });
          if (result) result.created ? summary.imported++ : summary.updated++;
        } catch (e) { summary.errors.push(`Row ${i + 2}: ${(e as Error).message}`); }
      }
    } else if (kind === "suppliers") {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const name = get(row, "name");
        if (!name) { summary.skipped++; continue; }
        try {
          const result = await ensureSupplier({
            name, phone: get(row, "phone"), email: get(row, "email"), address: get(row, "address"),
            city: get(row, "city"), contactPerson: get(row, "contactPerson"), openingBalance: get(row, "openingBalance"),
          });
          if (result) result.created ? summary.imported++ : summary.updated++;
        } catch (e) { summary.errors.push(`Row ${i + 2}: ${(e as Error).message}`); }
      }
    } else if (kind === "sales" || kind === "purchases") {
      // Group consecutive/all rows sharing the same invoice/PO number into one
      // transaction with multiple line items; rows with no number each become
      // their own single-item transaction.
      const numberField = kind === "sales" ? "invoiceNumber" : "poNumber";
      const partyField = kind === "sales" ? "customerName" : "supplierName";
      const groups = new Map<string, { number: string; party: string; date: string; status: string; notes: string; items: { productName: string; sku: string; quantity: number; price: number }[] }>();
      let autoSeq = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const productName = get(row, "productName");
        const qty = parseNumber(get(row, "quantity")) || 1;
        const price = parseNumber(get(row, kind === "sales" ? "unitPrice" : "unitCost"));
        if (!productName && !get(row, "sku")) { summary.skipped++; continue; }

        let number = get(row, numberField);
        if (!number) { autoSeq++; number = `__AUTOROW_${i}`; } // each becomes its own group unless sheet gave a real shared number
        const key = number;
        if (!groups.has(key)) {
          groups.set(key, {
            number: number.startsWith("__AUTOROW_") ? "" : number,
            party: get(row, partyField),
            date: get(row, kind === "sales" ? "saleDate" : "purchaseDate"),
            status: get(row, "status"),
            notes: get(row, "notes"),
            items: [],
          });
        }
        groups.get(key)!.items.push({ productName, sku: get(row, "sku"), quantity: qty, price });
      }

      let seq = 0;
      for (const group of groups.values()) {
        seq++;
        if (!group.items.length) { summary.skipped++; continue; }
        try {
          const partyName = group.party || (kind === "sales" ? "Imported Customer" : "Imported Supplier");
          const date = parseDate(group.date);

          try {
            const months = await import("../services/months.service.js");
            if (await months.isDateInClosedPeriod(date)) throw new months.MonthClosedError(date);
          } catch (err) {
            if (err && (err as Error).name === "MonthClosedError") throw err;
          }

          const lineItems = await Promise.all(group.items.map(async (item) => {
            let productId: number | undefined;
            const skuOrName = item.sku || item.productName;
            if (skuOrName) {
              const [existing] = await db.select({ id: productsTable.id }).from(productsTable).where(item.sku ? eq(productsTable.sku, item.sku) : eq(productsTable.name, item.productName));
              productId = existing?.id;
            }
            if (!productId) {
              const created = await ensureProduct({
                name: item.productName || `Imported item ${Date.now()}`,
                sku: item.sku || `IMP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                costPrice: kind === "purchases" ? item.price : 0,
              });
              productId = created?.id;
            }
            return { productId: productId ?? 0, productName: item.productName || "Imported item", quantity: item.quantity, price: item.price, total: item.quantity * item.price };
          }));

          const subtotal = round2(lineItems.reduce((s, l) => s + l.total, 0));

          if (kind === "sales") {
            const customerRow = partyName ? (await db.select({ id: customersTable.id }).from(customersTable).where(eq(customersTable.name, partyName)).limit(1))[0] ?? (await ensureCustomer({ name: partyName })) : null;
            const invoiceNumber = group.number || `INV-AI-${Date.now()}-${seq}`;
            const status = group.status || "completed";
            const total = subtotal;

            const inserted = await db.transaction(async (tx) => {
              const [row] = await tx.insert(salesTable).values({
                invoiceNumber, customerId: customerRow?.id ?? null, customerName: partyName,
                status, subtotal: String(subtotal), discount: "0", total: String(total),
                notes: group.notes || null,
                items: lineItems.map(l => ({ productId: l.productId, productName: l.productName, quantity: l.quantity, unitPrice: l.price, total: l.total })),
                saleDate: date,
              }).returning();

              if (customerRow?.id && status === "completed") {
                for (const line of lineItems) {
                  await tx.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} - ${line.quantity}` }).where(eq(productsTable.id, line.productId));
                  await appendLedgerEntry(tx, { customerId: customerRow.id, type: "sale", amount: round2(line.total), saleId: row.id, description: `AI import — ${invoiceNumber}`, createdByUserId, entryDate: date });
                }
                await appendGeneralLedgerEntry(tx, { date, type: "sale", referenceId: row.id, partyType: "customer", partyId: customerRow.id, partyName, amount: total, direction: "credit", note: `AI import invoice ${invoiceNumber}`, createdByUserId });
                await recomputeCustomerLedgerRunningBalances(tx, customerRow.id);
              }
              return row;
            });
            if (inserted) summary.imported++;
          } else {
            const supplierRow = partyName ? (await db.select({ id: suppliersTable.id }).from(suppliersTable).where(eq(suppliersTable.name, partyName)).limit(1))[0] ?? (await ensureSupplier({ name: partyName })) : null;
            const poNumber = group.number || `PO-AI-${Date.now()}-${seq}`;
            const status = group.status || "received";

            const inserted = await db.transaction(async (tx) => {
              const [row] = await tx.insert(purchasesTable).values({
                poNumber, supplierId: supplierRow?.id ?? null, supplierName: partyName,
                status, subtotal: String(subtotal), total: String(subtotal),
                notes: group.notes || null,
                items: lineItems.map(l => ({ productId: l.productId, productName: l.productName, quantity: l.quantity, unitCost: l.price, total: l.total })),
                purchaseDate: date,
              }).returning();

              if (supplierRow?.id) {
                await appendSupplierLedgerEntry(tx, { supplierId: supplierRow.id, type: "purchase", amount: round2(subtotal), purchaseId: row.id, description: `AI import — ${poNumber}`, createdByUserId, entryDate: date });
                await appendGeneralLedgerEntry(tx, { date, type: "purchase", referenceId: row.id, partyType: "supplier", partyId: supplierRow.id, partyName, amount: round2(subtotal), direction: "debit", note: `AI import PO ${poNumber}`, createdByUserId });
              }
              if (status === "received") {
                for (const line of lineItems) {
                  await tx.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} + ${line.quantity}` }).where(eq(productsTable.id, line.productId));
                }
              }
              return row;
            });
            if (inserted) summary.imported++;
          }
        } catch (e) {
          summary.errors.push(`${kind === "sales" ? "Invoice" : "PO"} ${group.number || "(auto)"}: ${(e as Error).message}`);
        }
      }
    }

    return res.json({ ...summary, message: `AI import complete: ${summary.imported} ${kind} imported${summary.updated ? `, ${summary.updated} updated` : ""}${summary.skipped ? `, ${summary.skipped} rows skipped` : ""}.` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "AI Excel import failed: " + (error as Error).message });
  }
});

export default router;
