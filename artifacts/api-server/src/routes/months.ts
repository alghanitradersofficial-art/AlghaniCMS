import { Router } from 'express';
import { db, monthClosures, yearClosures, sales, purchases, expenses } from '@workspace/db';
import { eq, and, sql, gte, lte } from 'drizzle-orm';
import { authMiddleware } from '../lib/auth.js';

const router = Router();
router.use(authMiddleware);
function toNum(v: any) { return Number(v) || 0; }

// GET all month closures
router.get('/', async (_req, res) => {
  try {
    const months = await db.select().from(monthClosures).orderBy(sql`year DESC, month DESC`);
    const years = await db.select().from(yearClosures).orderBy(sql`year DESC`);
    return res.json({ months: months.map(m => ({ ...m, totalSales: toNum(m.totalSales), totalPurchases: toNum(m.totalPurchases), totalExpenses: toNum(m.totalExpenses), grossProfit: toNum(m.grossProfit), netProfit: toNum(m.netProfit) })), years: years.map(y => ({ ...y, totalSales: toNum(y.totalSales), totalPurchases: toNum(y.totalPurchases), totalExpenses: toNum(y.totalExpenses), netProfit: toNum(y.netProfit) })) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET month status for a specific month
router.get('/:year/:month/status', async (req, res) => {
  const { year, month } = req.params;
  const [closure] = await db.select().from(monthClosures).where(and(eq(monthClosures.year, Number(year)), eq(monthClosures.month, Number(month))));
  return res.json({ year: Number(year), month: Number(month), status: closure?.status || 'open', closure: closure || null });
});

// POST /api/months/close - close a month
router.post('/close', async (req, res) => {
  try {
    const { year, month, notes } = req.body;
    const user = (req as any).user;

    // Check if already closed
    const [existing] = await db.select().from(monthClosures).where(and(eq(monthClosures.year, year), eq(monthClosures.month, month)));
    if (existing?.status === 'closed') return res.status(400).json({ error: 'Month already closed' });

    // Calculate totals for the month
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    const [salesTotal] = await db.select({ total: sql<number>`COALESCE(SUM(CAST(total AS NUMERIC)), 0)` }).from(sales).where(and(gte(sales.saleDate, start), lte(sales.saleDate, end)));
    const [purchTotal] = await db.select({ total: sql<number>`COALESCE(SUM(CAST(total AS NUMERIC)), 0)` }).from(purchases).where(and(gte(purchases.purchaseDate, start), lte(purchases.purchaseDate, end)));
    const [expTotal] = await db.select({ total: sql<number>`COALESCE(SUM(CAST(amount AS NUMERIC)), 0)` }).from(expenses).where(and(gte(expenses.date, start), lte(expenses.date, end)));

    const totalSales = Number(salesTotal.total);
    const totalPurchases = Number(purchTotal.total);
    const totalExpenses = Number(expTotal.total);
    const grossProfit = totalSales - totalPurchases;
    const netProfit = grossProfit - totalExpenses;

    if (existing) {
      const [updated] = await db.update(monthClosures).set({
        status: 'closed', closedAt: new Date(), closedBy: user.email,
        totalSales: String(totalSales), totalPurchases: String(totalPurchases),
        totalExpenses: String(totalExpenses), grossProfit: String(grossProfit),
        netProfit: String(netProfit), notes,
      }).where(eq(monthClosures.id, existing.id)).returning();
      return res.json({ message: 'Month closed', closure: updated });
    }

    const [closure] = await db.insert(monthClosures).values({
      year, month, status: 'closed', closedAt: new Date(), closedBy: user.email,
      totalSales: String(totalSales), totalPurchases: String(totalPurchases),
      totalExpenses: String(totalExpenses), grossProfit: String(grossProfit),
      netProfit: String(netProfit), notes,
    }).returning();
    return res.json({ message: 'Month closed', closure });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/months/:id/reopen
router.post('/:id/reopen', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!['ceo', 'developer', 'manager'].includes(user.role)) {
      return res.status(403).json({ error: 'Only CEO, Developer, or Manager can reopen months' });
    }
    const [updated] = await db.update(monthClosures).set({
      status: 'open', reopenedAt: new Date(), reopenedBy: user.email,
    }).where(eq(monthClosures.id, Number(req.params.id))).returning();
    if (!updated) return res.status(404).json({ error: 'Not found' });
    return res.json({ message: 'Month reopened', closure: updated });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/months/year/close
router.post('/year/close', async (req, res) => {
  try {
    const { year, notes } = req.body;
    const user = (req as any).user;

    const [existing] = await db.select().from(yearClosures).where(eq(yearClosures.year, year));
    if (existing?.status === 'closed') return res.status(400).json({ error: 'Year already closed' });

    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59);

    const [salesTotal] = await db.select({ total: sql<number>`COALESCE(SUM(CAST(total AS NUMERIC)), 0)` }).from(sales).where(and(gte(sales.saleDate, start), lte(sales.saleDate, end)));
    const [purchTotal] = await db.select({ total: sql<number>`COALESCE(SUM(CAST(total AS NUMERIC)), 0)` }).from(purchases).where(and(gte(purchases.purchaseDate, start), lte(purchases.purchaseDate, end)));
    const [expTotal] = await db.select({ total: sql<number>`COALESCE(SUM(CAST(amount AS NUMERIC)), 0)` }).from(expenses).where(and(gte(expenses.date, start), lte(expenses.date, end)));

    const totalSales = Number(salesTotal.total);
    const totalPurchases = Number(purchTotal.total);
    const totalExpenses = Number(expTotal.total);
    const netProfit = totalSales - totalPurchases - totalExpenses;

    const values = { year, status: 'closed' as const, closedAt: new Date(), closedBy: user.email, totalSales: String(totalSales), totalPurchases: String(totalPurchases), totalExpenses: String(totalExpenses), netProfit: String(netProfit), notes };

    if (existing) {
      const [u] = await db.update(yearClosures).set({ ...values }).where(eq(yearClosures.id, existing.id)).returning();
      return res.json({ message: 'Year closed', closure: u });
    }

    const [closure] = await db.insert(yearClosures).values(values).returning();
    return res.json({ message: 'Year closed', closure });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/year/:id/reopen', async (req, res) => {
  try {
    const user = (req as any).user;
    if (!['ceo', 'developer'].includes(user.role)) return res.status(403).json({ error: 'Only CEO or Developer can reopen year' });
    const [updated] = await db.update(yearClosures).set({ status: 'open', reopenedAt: new Date(), reopenedBy: user.email }).where(eq(yearClosures.id, Number(req.params.id))).returning();
    return res.json({ message: 'Year reopened', closure: updated });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
