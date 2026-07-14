import { Router } from 'express';
import { authMiddleware } from '../lib/auth.js';
import { db, sales, saleItems, purchases, purchaseItems, expenses, customers, suppliers, products } from '@workspace/db';
import { eq, sql } from 'drizzle-orm';

const router = Router();
router.use(authMiddleware);
function toNum(v: any) { return Number(v) || 0; }

async function genInv() {
  const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(sales);
  return `INV-${String(Number(count) + 1).padStart(5, '0')}`;
}
async function genPO() {
  const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(purchases);
  return `PO-${String(Number(count) + 1).padStart(5, '0')}`;
}

// POST /api/quick-entry/sales - multiple sales entries at once
router.post('/sales', async (req, res) => {
  try {
    const entries = req.body.entries; // array of sale objects
    const results = [];
    for (const body of entries) {
      const invoiceNumber = body.invoiceNumber || await genInv();
      const saleDate = body.date ? new Date(body.date) : new Date();
      const total = toNum(body.total);
      const [sale] = await db.insert(sales).values({
        invoiceNumber, customerId: body.customerId || null,
        customerName: body.customerName || 'Walk-in Customer',
        status: 'completed', subtotal: String(total), discount: '0',
        total: String(total), paidAmount: String(body.paidAmount ?? total),
        notes: body.notes, saleDate,
      }).returning();

      if (body.items?.length) {
        await db.insert(saleItems).values(body.items.map((i: any) => ({
          saleId: sale.id, productId: i.productId || null,
          productName: i.productName || 'Item', quantity: String(i.quantity || 1),
          unitPrice: String(i.unitPrice || 0), total: String(i.total || 0),
        })));
      }
      results.push({ id: sale.id, invoiceNumber, total });
    }
    return res.status(201).json({ message: `${results.length} sale(s) created`, results });
  } catch (err: any) { return res.status(400).json({ error: err.message }); }
});

// POST /api/quick-entry/purchases
router.post('/purchases', async (req, res) => {
  try {
    const entries = req.body.entries;
    const results = [];
    for (const body of entries) {
      const poNumber = body.poNumber || await genPO();
      const purchaseDate = body.date ? new Date(body.date) : new Date();
      const total = toNum(body.total);
      const [purchase] = await db.insert(purchases).values({
        poNumber, supplierId: body.supplierId || null,
        supplierName: body.supplierName || 'Unknown Supplier',
        status: 'received', subtotal: String(total), total: String(total),
        paidAmount: String(body.paidAmount ?? total),
        notes: body.notes, purchaseDate,
      }).returning();

      if (body.items?.length) {
        await db.insert(purchaseItems).values(body.items.map((i: any) => ({
          purchaseId: purchase.id, productId: i.productId || null,
          productName: i.productName || 'Item', quantity: String(i.quantity || 1),
          unitCost: String(i.unitCost || 0), total: String(i.total || 0),
        })));
      }
      results.push({ id: purchase.id, poNumber, total });
    }
    return res.status(201).json({ message: `${results.length} purchase(s) created`, results });
  } catch (err: any) { return res.status(400).json({ error: err.message }); }
});

// POST /api/quick-entry/expenses
router.post('/expenses', async (req, res) => {
  try {
    const entries = req.body.entries;
    const results = [];
    for (const body of entries) {
      const [exp] = await db.insert(expenses).values({
        title: body.title, category: body.category || 'General',
        amount: String(body.amount), date: body.date ? new Date(body.date) : new Date(),
        notes: body.notes,
      }).returning();
      results.push({ id: exp.id, title: exp.title, amount: Number(exp.amount) });
    }
    return res.status(201).json({ message: `${results.length} expense(s) created`, results });
  } catch (err: any) { return res.status(400).json({ error: err.message }); }
});

export default router;
