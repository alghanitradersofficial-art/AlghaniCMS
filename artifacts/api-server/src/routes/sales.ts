import { Router } from 'express';
import { db, sales, saleItems, customers, customerLedger, products } from '@workspace/db';
import { eq, ilike, and, sql, gte, lte } from 'drizzle-orm';
import { authMiddleware } from '../lib/auth.js';

const router = Router();
router.use(authMiddleware);

function toNum(v: any) { return Number(v) || 0; }

async function genInvoiceNo(): Promise<string> {
  const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(sales);
  const n = Number(count) + 1;
  return `INV-${String(n).padStart(5, '0')}`;
}

router.get('/', async (req, res) => {
  try {
    const { search, status, customerId, startDate, endDate, page = 1, limit = 20 } = req.query;
    const conditions: any[] = [];
    if (search) conditions.push(ilike(sales.customerName, `%${search}%`));
    if (status) conditions.push(eq(sales.status, String(status)));
    if (customerId) conditions.push(eq(sales.customerId, Number(customerId)));
    if (startDate) conditions.push(gte(sales.saleDate, new Date(String(startDate))));
    if (endDate) conditions.push(lte(sales.saleDate, new Date(String(endDate))));
    const where = conditions.length ? and(...conditions) : undefined;
    const offset = (Number(page) - 1) * Number(limit);

    const rows = await db.select().from(sales).where(where).orderBy(sql`sale_date DESC`).limit(Number(limit)).offset(offset);
    const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(sales).where(where);

    const data = await Promise.all(rows.map(async (s) => {
      const items = await db.select().from(saleItems).where(eq(saleItems.saleId, s.id));
      return {
        ...s, subtotal: toNum(s.subtotal), discount: toNum(s.discount),
        total: toNum(s.total), paidAmount: toNum(s.paidAmount),
        saleDate: s.saleDate.toISOString(), createdAt: s.createdAt.toISOString(),
        items: items.map(i => ({ ...i, quantity: toNum(i.quantity), unitPrice: toNum(i.unitPrice), total: toNum(i.total) })),
      };
    }));
    return res.json({ data, total: Number(count), page: Number(page), limit: Number(limit) });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  const [s] = await db.select().from(sales).where(eq(sales.id, Number(req.params.id)));
  if (!s) return res.status(404).json({ error: 'Not found' });
  const items = await db.select().from(saleItems).where(eq(saleItems.saleId, s.id));
  return res.json({ ...s, subtotal: toNum(s.subtotal), discount: toNum(s.discount), total: toNum(s.total), paidAmount: toNum(s.paidAmount), saleDate: s.saleDate.toISOString(), createdAt: s.createdAt.toISOString(), items: items.map(i => ({ ...i, quantity: toNum(i.quantity), unitPrice: toNum(i.unitPrice), total: toNum(i.total) })) });
});

router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const invoiceNumber = body.invoiceNumber || await genInvoiceNo();
    const saleDate = body.saleDate ? new Date(body.saleDate) : new Date();

    const [sale] = await db.insert(sales).values({
      invoiceNumber, customerId: body.customerId || null,
      customerName: body.customerName, status: body.status || 'completed',
      subtotal: String(body.subtotal || 0), discount: String(body.discount || 0),
      total: String(body.total || 0), paidAmount: String(body.paidAmount || body.total || 0),
      notes: body.notes, saleDate,
    }).returning();

    if (body.items?.length) {
      await db.insert(saleItems).values(body.items.map((i: any) => ({
        saleId: sale.id, productId: i.productId || null,
        productName: i.productName, quantity: String(i.quantity),
        unitPrice: String(i.unitPrice), total: String(i.total),
      })));
      // Update stock
      for (const item of body.items) {
        if (item.productId) {
          await db.update(products).set({ currentStock: sql`CAST(current_stock AS NUMERIC) - ${item.quantity}`, updatedAt: new Date() }).where(eq(products.id, item.productId));
        }
      }
    }

    // Update customer ledger & balance
    if (body.customerId) {
      const [cust] = await db.select().from(customers).where(eq(customers.id, body.customerId));
      if (cust) {
        const prevBal = toNum(cust.currentBalance);
        const newBal = prevBal + toNum(body.total) - toNum(body.paidAmount || body.total);
        await db.insert(customerLedger).values({
          customerId: body.customerId, type: 'debit', amount: String(body.total),
          balance: String(newBal), description: `Sale Invoice ${invoiceNumber}`,
          refId: sale.id, refType: 'sale', entryDate: saleDate,
        });
        await db.update(customers).set({
          currentBalance: String(newBal),
          totalOrders: sql`total_orders + 1`,
          totalSpent: sql`CAST(total_spent AS NUMERIC) + ${toNum(body.total)}`,
          updatedAt: new Date(),
        }).where(eq(customers.id, body.customerId));
      }
    }

    return res.status(201).json({ ...sale, total: toNum(sale.total) });
  } catch (err: any) { return res.status(400).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.update(sales).set({
      customerName: body.customerName, status: body.status,
      subtotal: body.subtotal !== undefined ? String(body.subtotal) : undefined,
      discount: body.discount !== undefined ? String(body.discount) : undefined,
      total: body.total !== undefined ? String(body.total) : undefined,
      paidAmount: body.paidAmount !== undefined ? String(body.paidAmount) : undefined,
      notes: body.notes, updatedAt: new Date(),
      saleDate: body.saleDate ? new Date(body.saleDate) : undefined,
    }).where(eq(sales.id, Number(req.params.id))).returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.json(row);
  } catch (err: any) { return res.status(400).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  await db.delete(saleItems).where(eq(saleItems.saleId, Number(req.params.id)));
  await db.delete(sales).where(eq(sales.id, Number(req.params.id)));
  return res.status(204).send();
});

export default router;
