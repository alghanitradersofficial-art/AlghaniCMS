import { Router } from "express";
import { pool, db, productsTable, customersTable, suppliersTable, purchasesTable, salesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import multer from "multer";
import ExcelJS from "exceljs";
import path from "path";
import { groqVision, groqChat, getGroqClient } from "../lib/groq.js";
import { appendLedgerEntry, round2 } from "../lib/ledger.js";
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

  const [existing] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.sku, sku));
  if (existing) {
    await db.update(productsTable).set({
      name,
      costPrice: String(parseNumber(productData.costPrice)),
      salePrice: String(parseNumber(productData.salePrice)),
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
    salePrice: String(parseNumber(productData.salePrice)),
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
          const created = await ensureProduct({ name: parseStr(item.productName) || `Imported item ${Date.now()}`, sku: parseStr(item.sku) || `ITEM-${Math.random().toString(36).slice(2, 8)}`, costPrice: item.unitCost, salePrice: item.unitCost });
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
          const created = await ensureProduct({ name: parseStr(item.productName) || `Imported item ${Date.now()}`, sku: parseStr(item.sku) || `ITEM-${Math.random().toString(36).slice(2, 8)}`, costPrice: item.unitPrice, salePrice: item.unitPrice });
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
      products: `Extract ALL product/inventory data from this image. Return ONLY a JSON array like: [{"name":"Product Name","sku":"SKU-001","costPrice":500,"salePrice":750,"currentStock":100,"unit":"pcs","category":""}]. Extract every product visible. If no clear price, use 0.`,
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
            `INSERT INTO products (name, sku, cost_price, sale_price, current_stock, unit) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (sku) DO UPDATE SET name=$1,cost_price=$3,sale_price=$4,current_stock=$5`,
            [parseStr(item.name), parseStr(item.sku) || `AI-${Date.now()}-${count}`, parseNumber(item.costPrice).toFixed(2), parseNumber(item.salePrice).toFixed(2), parseInt(item.currentStock) || 0, parseStr(item.unit) || "pcs"]
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
      products: `Extract product/inventory data from this document text. Return ONLY a JSON array: [{"name":"","sku":"","costPrice":0,"salePrice":0,"currentStock":0,"unit":"pcs","category":""}]\n\nDocument:\n${textContent.substring(0, 6000)}`,
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
            `INSERT INTO products (name, sku, cost_price, sale_price, current_stock, unit) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (sku) DO UPDATE SET name=$1,cost_price=$3,sale_price=$4`,
            [parseStr(item.name) || "Unknown", parseStr(item.sku) || `DOC${Date.now()}${count}`, parseNumber(item.costPrice).toFixed(2), parseNumber(item.salePrice).toFixed(2), parseInt(item.currentStock) || 0, parseStr(item.unit) || "pcs"]
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
      try {
        await pool.query(`INSERT INTO products (name,sku,cost_price,sale_price,current_stock,min_stock,unit) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (sku) DO UPDATE SET name=$1,cost_price=$3,sale_price=$4,current_stock=$5,min_stock=$6`,
          [name, sku || `IMP${rn}`, parseNumber(costIdx >= 0 ? cells[costIdx] : 0).toFixed(2), parseNumber(saleIdx >= 0 ? cells[saleIdx] : 0).toFixed(2), parseInt(String(stockIdx >= 0 ? cells[stockIdx] : 0)) || 0, parseInt(String(minIdx >= 0 ? cells[minIdx] : 5)) || 5, parseStr(unitIdx >= 0 ? cells[unitIdx] : "pcs") || "pcs"]);
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


export default router;
