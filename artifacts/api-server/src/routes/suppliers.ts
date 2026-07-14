import { Router } from 'express';
import { db, suppliers, supplierLedger } from '@workspace/db';
import { eq, ilike, and, sql, gte, lte } from 'drizzle-orm';
import { authMiddleware } from '../lib/auth.js';

const router = Router();
router.use(authMiddleware);
function toNum(v: any) { return Number(v) || 0; }

router.get('/', async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const where = search ? ilike(suppliers.name, `%${search}%`) : undefined;
    const offset = (Number(page) - 1) * Number(limit);
    const rows = await db.select().from(suppliers).where(where).orderBy(suppliers.name).limit(Number(limit)).offset(offset);
    const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(suppliers).where(where);
    res.json({ data: rows.map(s => ({ ...s, openingBalance: toNum(s.openingBalance), currentBalance: toNum(s.currentBalance), createdAt: s.createdAt.toISOString() })), total: Number(count), page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/suggestions', async (req, res) => {
  const { q } = req.query;
  const rows = await db.select({ id: suppliers.id, name: suppliers.name, phone: suppliers.phone }).from(suppliers).where(ilike(suppliers.name, `%${q || ''}%`)).limit(10);
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const [s] = await db.select().from(suppliers).where(eq(suppliers.id, Number(req.params.id)));
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json({ ...s, openingBalance: toNum(s.openingBalance), currentBalance: toNum(s.currentBalance), createdAt: s.createdAt.toISOString() });
});

router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const openBal = toNum(body.openingBalance);
    const [row] = await db.insert(suppliers).values({
      name: body.name, phone: body.phone, email: body.email,
      address: body.address, city: body.city,
      openingBalance: String(openBal), currentBalance: String(openBal),
      createdAt: body.createdAt ? new Date(body.createdAt) : new Date(),
    }).returning();
    if (openBal !== 0) {
      await db.insert(supplierLedger).values({
        supplierId: row.id, type: openBal > 0 ? 'credit' : 'debit',
        amount: String(Math.abs(openBal)), balance: String(openBal),
        description: 'Opening Balance', refType: 'opening',
        entryDate: body.createdAt ? new Date(body.createdAt) : new Date(),
      });
    }
    res.status(201).json(row);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.update(suppliers).set({
      name: body.name, phone: body.phone, email: body.email,
      address: body.address, city: body.city,
      openingBalance: body.openingBalance !== undefined ? String(body.openingBalance) : undefined,
      updatedAt: new Date(),
    }).where(eq(suppliers.id, Number(req.params.id))).returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  await db.delete(suppliers).where(eq(suppliers.id, Number(req.params.id)));
  res.status(204).send();
});

router.get('/:id/ledger', async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 50 } = req.query;
    const conditions: any[] = [eq(supplierLedger.supplierId, Number(req.params.id))];
    if (startDate) conditions.push(gte(supplierLedger.entryDate, new Date(String(startDate))));
    if (endDate) conditions.push(lte(supplierLedger.entryDate, new Date(String(endDate))));
    const where = and(...conditions);
    const offset = (Number(page) - 1) * Number(limit);
    const rows = await db.select().from(supplierLedger).where(where).orderBy(sql`entry_date DESC`).limit(Number(limit)).offset(offset);
    const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(supplierLedger).where(where);
    const [supp] = await db.select().from(suppliers).where(eq(suppliers.id, Number(req.params.id)));
    res.json({ supplier: supp ? { ...supp, currentBalance: toNum(supp.currentBalance) } : null, data: rows.map(r => ({ ...r, amount: toNum(r.amount), balance: toNum(r.balance), entryDate: r.entryDate.toISOString() })), total: Number(count), page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/payment', async (req, res) => {
  try {
    const body = req.body;
    const [supp] = await db.select().from(suppliers).where(eq(suppliers.id, Number(req.params.id)));
    if (!supp) return res.status(404).json({ error: 'Not found' });
    const newBal = toNum(supp.currentBalance) - toNum(body.amount);
    await db.insert(supplierLedger).values({
      supplierId: supp.id, type: 'debit', amount: String(body.amount),
      balance: String(newBal), description: body.description || 'Payment Made',
      refType: 'payment', entryDate: body.date ? new Date(body.date) : new Date(),
    });
    await db.update(suppliers).set({ currentBalance: String(newBal), updatedAt: new Date() }).where(eq(suppliers.id, supp.id));
    res.json({ message: 'Payment recorded', newBalance: newBal });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

export default router;
