import { Router } from 'express';
import { db, purchases, purchaseItems, suppliers, supplierLedger, products } from '@workspace/db';
import { eq, ilike, and, sql, gte, lte } from 'drizzle-orm';
import { authMiddleware } from '../lib/auth.js';

const router = Router();
router.use(authMiddleware);

function toNum(v: any) { return Number(v) || 0; }

async function genPONumber(): Promise<string> {
  const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(purchases);
  return `PO-${String(Number(count) + 1).padStart(5, '0')}`;
}

router.get('/', async (req, res) => {
  try {
    const { search, status, supplierId, startDate, endDate, page = 1, limit = 20 } = req.query;
    const conditions: any[] = [];
    if (search) conditions.push(ilike(purchases.supplierName, `%${search}%`));
    if (status) conditions.push(eq(purchases.status, String(status)));
    if (supplierId) conditions.push(eq(purchases.supplierId, Number(supplierId)));
    if (startDate) conditions.push(gte(purchases.purchaseDate, new Date(String(startDate))));
    if (endDate) conditions.push(lte(purchases.purchaseDate, new Date(String(endDate))));
    const where = conditions.length ? and(...conditions) : undefined;
    const offset = (Number(page) - 1) * Number(limit);

    const rows = await db.select().from(purchases).where(where).orderBy(sql`purchase_date DESC`).limit(Number(limit)).offset(offset);
    const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(purchases).where(where);

    const data = await Promise.all(rows.map(async (p) => {
      const items = await db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, p.id));
      return {
        ...p, subtotal: toNum(p.subtotal), total: toNum(p.total), paidAmount: toNum(p.paidAmount),
        purchaseDate: p.purchaseDate.toISOString(), createdAt: p.createdAt.toISOString(),
        items: items.map(i => ({ ...i, quantity: toNum(i.quantity), unitCost: toNum(i.unitCost), total: toNum(i.total) })),
      };
    }));
    return res.json({ data, total: Number(count), page: Number(page), limit: Number(limit) });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  const [p] = await db.select().from(purchases).where(eq(purchases.id, Number(req.params.id)));
  if (!p) return res.status(404).json({ error: 'Not found' });
  const items = await db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, p.id));
  return res.json({ ...p, subtotal: toNum(p.subtotal), total: toNum(p.total), paidAmount: toNum(p.paidAmount), purchaseDate: p.purchaseDate.toISOString(), createdAt: p.createdAt.toISOString(), items: items.map(i => ({ ...i, quantity: toNum(i.quantity), unitCost: toNum(i.unitCost), total: toNum(i.total) })) });
});

router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const poNumber = body.poNumber || await genPONumber();
    const purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : new Date();

    const [purchase] = await db.insert(purchases).values({
      poNumber, supplierId: body.supplierId || null,
      supplierName: body.supplierName, status: body.status || 'received',
      subtotal: String(body.subtotal || 0), total: String(body.total || 0),
      paidAmount: String(body.paidAmount || body.total || 0),
      notes: body.notes, purchaseDate,
    }).returning();

    if (body.items?.length) {
      await db.insert(purchaseItems).values(body.items.map((i: any) => ({
        purchaseId: purchase.id, productId: i.productId || null,
        productName: i.productName, quantity: String(i.quantity),
        unitCost: String(i.unitCost), total: String(i.total),
      })));
      // Update stock
      for (const item of body.items) {
        if (item.productId) {
          await db.update(products).set({ currentStock: sql`CAST(current_stock AS NUMERIC) + ${item.quantity}`, updatedAt: new Date() }).where(eq(products.id, item.productId));
        }
      }
    }

    if (body.supplierId) {
      const [supp] = await db.select().from(suppliers).where(eq(suppliers.id, body.supplierId));
      if (supp) {
        const prevBal = toNum(supp.currentBalance);
        const newBal = prevBal + toNum(body.total) - toNum(body.paidAmount || body.total);
        await db.insert(supplierLedger).values({
          supplierId: body.supplierId, type: 'credit', amount: String(body.total),
          balance: String(newBal), description: `Purchase Order ${poNumber}`,
          refId: purchase.id, refType: 'purchase', entryDate: purchaseDate,
        });
        await db.update(suppliers).set({ currentBalance: String(newBal), updatedAt: new Date() }).where(eq(suppliers.id, body.supplierId));
      }
    }

    return res.status(201).json({ ...purchase, total: toNum(purchase.total) });
  } catch (err: any) { return res.status(400).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.update(purchases).set({
      supplierName: body.supplierName, status: body.status,
      subtotal: body.subtotal !== undefined ? String(body.subtotal) : undefined,
      total: body.total !== undefined ? String(body.total) : undefined,
      paidAmount: body.paidAmount !== undefined ? String(body.paidAmount) : undefined,
      notes: body.notes, updatedAt: new Date(),
      purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : undefined,
    }).where(eq(purchases.id, Number(req.params.id))).returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.json(row);
  } catch (err: any) { return res.status(400).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  await db.delete(purchaseItems).where(eq(purchaseItems.purchaseId, Number(req.params.id)));
  await db.delete(purchases).where(eq(purchases.id, Number(req.params.id)));
  return res.status(204).send();
});

export default router;
