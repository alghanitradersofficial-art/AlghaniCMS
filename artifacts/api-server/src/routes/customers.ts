import { Router } from 'express';
import { db, customers, customerLedger } from '@workspace/db';
import { eq, ilike, and, sql, gte, lte } from 'drizzle-orm';
import { authMiddleware } from '../lib/auth.js';

const router = Router();
router.use(authMiddleware);
function toNum(v: any) { return Number(v) || 0; }

router.get('/', async (req, res) => {
  try {
    const { search, type, page = 1, limit = 50 } = req.query;
    const conditions: any[] = [];
    if (search) conditions.push(ilike(customers.name, `%${search}%`));
    if (type) conditions.push(eq(customers.type, String(type)));
    const where = conditions.length ? and(...conditions) : undefined;
    const offset = (Number(page) - 1) * Number(limit);

    const rows = await db.select().from(customers).where(where).orderBy(customers.name).limit(Number(limit)).offset(offset);
    const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(customers).where(where);

    res.json({
      data: rows.map(c => ({ ...c, openingBalance: toNum(c.openingBalance), currentBalance: toNum(c.currentBalance), totalSpent: toNum(c.totalSpent), createdAt: c.createdAt.toISOString() })),
      total: Number(count), page: Number(page), limit: Number(limit),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET suggestions for quick entry
router.get('/suggestions', async (req, res) => {
  const { q } = req.query;
  const rows = await db.select({ id: customers.id, name: customers.name, phone: customers.phone, type: customers.type })
    .from(customers).where(ilike(customers.name, `%${q || ''}%`)).limit(10);
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const [c] = await db.select().from(customers).where(eq(customers.id, Number(req.params.id)));
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json({ ...c, openingBalance: toNum(c.openingBalance), currentBalance: toNum(c.currentBalance), totalSpent: toNum(c.totalSpent), createdAt: c.createdAt.toISOString() });
});

router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const openBal = toNum(body.openingBalance);
    const [row] = await db.insert(customers).values({
      name: body.name, phone: body.phone, email: body.email,
      address: body.address, city: body.city, type: body.type || 'retail',
      openingBalance: String(openBal), currentBalance: String(openBal),
      createdAt: body.createdAt ? new Date(body.createdAt) : new Date(),
    }).returning();

    if (openBal !== 0) {
      await db.insert(customerLedger).values({
        customerId: row.id, type: openBal > 0 ? 'debit' : 'credit',
        amount: String(Math.abs(openBal)), balance: String(openBal),
        description: 'Opening Balance', refType: 'opening',
        entryDate: body.createdAt ? new Date(body.createdAt) : new Date(),
      });
    }
    res.status(201).json({ ...row, openingBalance: toNum(row.openingBalance), currentBalance: toNum(row.currentBalance) });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.update(customers).set({
      name: body.name, phone: body.phone, email: body.email,
      address: body.address, city: body.city, type: body.type,
      openingBalance: body.openingBalance !== undefined ? String(body.openingBalance) : undefined,
      updatedAt: new Date(),
    }).where(eq(customers.id, Number(req.params.id))).returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ ...row, openingBalance: toNum(row.openingBalance), currentBalance: toNum(row.currentBalance) });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  await db.delete(customers).where(eq(customers.id, Number(req.params.id)));
  res.status(204).send();
});

// GET /api/customers/:id/ledger
router.get('/:id/ledger', async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 50 } = req.query;
    const conditions: any[] = [eq(customerLedger.customerId, Number(req.params.id))];
    if (startDate) conditions.push(gte(customerLedger.entryDate, new Date(String(startDate))));
    if (endDate) conditions.push(lte(customerLedger.entryDate, new Date(String(endDate))));
    const where = and(...conditions);
    const offset = (Number(page) - 1) * Number(limit);

    const rows = await db.select().from(customerLedger).where(where).orderBy(sql`entry_date DESC`).limit(Number(limit)).offset(offset);
    const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(customerLedger).where(where);
    const [cust] = await db.select().from(customers).where(eq(customers.id, Number(req.params.id)));

    res.json({
      customer: cust ? { ...cust, currentBalance: toNum(cust.currentBalance) } : null,
      data: rows.map(r => ({ ...r, amount: toNum(r.amount), balance: toNum(r.balance), entryDate: r.entryDate.toISOString() })),
      total: Number(count), page: Number(page), limit: Number(limit),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST payment entry
router.post('/:id/payment', async (req, res) => {
  try {
    const body = req.body;
    const [cust] = await db.select().from(customers).where(eq(customers.id, Number(req.params.id)));
    if (!cust) return res.status(404).json({ error: 'Not found' });
    const newBal = toNum(cust.currentBalance) - toNum(body.amount);
    await db.insert(customerLedger).values({
      customerId: cust.id, type: 'credit', amount: String(body.amount),
      balance: String(newBal), description: body.description || 'Payment Received',
      refType: 'payment', entryDate: body.date ? new Date(body.date) : new Date(),
    });
    await db.update(customers).set({ currentBalance: String(newBal), updatedAt: new Date() }).where(eq(customers.id, cust.id));
    res.json({ message: 'Payment recorded', newBalance: newBal });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

export default router;
