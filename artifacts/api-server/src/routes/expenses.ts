import { Router } from 'express';
import { db, expenses } from '@workspace/db';
import { eq, ilike, and, sql, gte, lte } from 'drizzle-orm';
import { authMiddleware } from '../lib/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { search, category, startDate, endDate, page = 1, limit = 20 } = req.query;
    const conditions: any[] = [];
    if (search) conditions.push(ilike(expenses.title, `%${search}%`));
    if (category) conditions.push(eq(expenses.category, String(category)));
    if (startDate) conditions.push(gte(expenses.date, new Date(String(startDate))));
    if (endDate) conditions.push(lte(expenses.date, new Date(String(endDate))));
    const where = conditions.length ? and(...conditions) : undefined;
    const offset = (Number(page) - 1) * Number(limit);
    const rows = await db.select().from(expenses).where(where).orderBy(sql`date DESC`).limit(Number(limit)).offset(offset);
    const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(expenses).where(where);
    return res.json({ data: rows.map(e => ({ ...e, amount: Number(e.amount), date: e.date.toISOString(), createdAt: e.createdAt.toISOString() })), total: Number(count), page: Number(page), limit: Number(limit) });
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  const [e] = await db.select().from(expenses).where(eq(expenses.id, Number(req.params.id)));
  if (!e) return res.status(404).json({ error: 'Not found' });
  return res.json({ ...e, amount: Number(e.amount), date: e.date.toISOString() });
});

router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.insert(expenses).values({
      title: body.title, category: body.category,
      amount: String(body.amount), date: body.date ? new Date(body.date) : new Date(),
      notes: body.notes,
    }).returning();
    return res.status(201).json({ ...row, amount: Number(row.amount), date: row.date.toISOString() });
  } catch (err: any) { return res.status(400).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const body = req.body;
    const [row] = await db.update(expenses).set({
      title: body.title, category: body.category,
      amount: body.amount !== undefined ? String(body.amount) : undefined,
      date: body.date ? new Date(body.date) : undefined,
      notes: body.notes, updatedAt: new Date(),
    }).where(eq(expenses.id, Number(req.params.id))).returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.json({ ...row, amount: Number(row.amount), date: row.date.toISOString() });
  } catch (err: any) { return res.status(400).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  await db.delete(expenses).where(eq(expenses.id, Number(req.params.id)));
  return res.status(204).send();
});

export default router;
