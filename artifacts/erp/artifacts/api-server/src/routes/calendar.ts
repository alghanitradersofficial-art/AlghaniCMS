import { Router } from "express";
import { db, generalLedgerEntriesTable } from "@workspace/db";
import { and, gte, lte, sql, asc } from "drizzle-orm";
import { buildDailyHistoryFromLedgerEntries } from "../lib/daily-history.js";

const router = Router();

// GET /api/calendar/month?year=2026&month=7 — one row per day with a quick summary,
// for rendering the month grid. Works for any month/year, past or present.
router.get("/month", async (req, res): Promise<any> => {
  try {
    const year = parseInt(req.query.year as string);
    const month = parseInt(req.query.month as string); // 1-12
    if (!year || !month) return res.status(400).json({ error: "year and month are required" });

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    const rows = await db
      .select({
        day: sql<string>`to_char(${generalLedgerEntriesTable.date}, 'YYYY-MM-DD')`,
        type: generalLedgerEntriesTable.type,
        direction: generalLedgerEntriesTable.direction,
        amount: sql<string>`SUM(${generalLedgerEntriesTable.amount})`,
        count: sql<string>`COUNT(*)`,
      })
      .from(generalLedgerEntriesTable)
      .where(and(gte(generalLedgerEntriesTable.date, start), lte(generalLedgerEntriesTable.date, end)))
      .groupBy(sql`to_char(${generalLedgerEntriesTable.date}, 'YYYY-MM-DD')`, generalLedgerEntriesTable.type, generalLedgerEntriesTable.direction);

    // Fold into one summary object per day.
    const byDay = new Map<string, { date: string; salesTotal: number; salesCount: number; purchasesTotal: number; expensesTotal: number; totalIn: number; totalOut: number; transactionCount: number }>();

    for (const r of rows) {
      const amount = parseFloat(r.amount);
      const count = parseInt(r.count);
      if (!byDay.has(r.day)) {
        byDay.set(r.day, { date: r.day, salesTotal: 0, salesCount: 0, purchasesTotal: 0, expensesTotal: 0, totalIn: 0, totalOut: 0, transactionCount: 0 });
      }
      const entry = byDay.get(r.day)!;
      entry.transactionCount += count;
      if (r.direction === "credit") entry.totalIn += amount; else entry.totalOut += amount;
      if (r.type === "sale") { entry.salesTotal += amount; entry.salesCount += count; }
      if (r.type === "purchase") entry.purchasesTotal += amount;
      if (r.type === "expense") entry.expensesTotal += amount;
    }

    return res.json({
      year,
      month,
      days: Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch calendar month summary" });
  }
});

// GET /api/calendar/history?year=2026&month=7 — a day-by-day ledger-style history for the selected month.
router.get("/history", async (req, res): Promise<any> => {
  try {
    const year = Number.parseInt(req.query.year as string, 10);
    const month = Number.parseInt(req.query.month as string, 10);
    const now = new Date();
    const resolvedYear = Number.isFinite(year) && year > 0 ? year : now.getFullYear();
    const resolvedMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : now.getMonth() + 1;

    const start = new Date(resolvedYear, resolvedMonth - 1, 1);
    const end = new Date(resolvedYear, resolvedMonth, 0, 23, 59, 59, 999);

    const rows = await db
      .select({
        date: generalLedgerEntriesTable.date,
        type: generalLedgerEntriesTable.type,
        amount: generalLedgerEntriesTable.amount,
        direction: generalLedgerEntriesTable.direction,
        note: generalLedgerEntriesTable.note,
      })
      .from(generalLedgerEntriesTable)
      .where(and(gte(generalLedgerEntriesTable.date, start), lte(generalLedgerEntriesTable.date, end)))
      .orderBy(asc(generalLedgerEntriesTable.date));

    const history = buildDailyHistoryFromLedgerEntries(
      rows.map((row) => ({
        date: row.date,
        type: row.type,
        amount: row.amount,
        direction: row.direction,
        note: row.note,
      })),
      { year: resolvedYear, month: resolvedMonth, includeEmptyDays: true },
    );

    return res.json(history);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch daily history" });
  }
});

// GET /api/calendar/day?date=2026-07-08 — everything that happened on a single day.
router.get("/day", async (req, res): Promise<any> => {
  try {
    const dateStr = req.query.date as string;
    if (!dateStr) return res.status(400).json({ error: "date (YYYY-MM-DD) is required" });

    const [year, month, day] = dateStr.split("-").map(Number);
    const start = new Date(year, month - 1, day, 0, 0, 0, 0);
    const end = new Date(year, month - 1, day, 23, 59, 59, 999);

    const entries = await db
      .select()
      .from(generalLedgerEntriesTable)
      .where(and(gte(generalLedgerEntriesTable.date, start), lte(generalLedgerEntriesTable.date, end)))
      .orderBy(asc(generalLedgerEntriesTable.date));

    const grouped: Record<string, typeof entries> = {};
    for (const e of entries) {
      grouped[e.type] = grouped[e.type] || [];
      grouped[e.type].push(e);
    }

    const totalIn = entries.filter((e) => e.direction === "credit").reduce((s, e) => s + parseFloat(e.amount as string), 0);
    const totalOut = entries.filter((e) => e.direction === "debit").reduce((s, e) => s + parseFloat(e.amount as string), 0);

    return res.json({
      date: dateStr,
      totalIn: Math.round(totalIn * 100) / 100,
      totalOut: Math.round(totalOut * 100) / 100,
      netFlow: Math.round((totalIn - totalOut) * 100) / 100,
      transactionCount: entries.length,
      byType: Object.fromEntries(
        Object.entries(grouped).map(([type, list]) => [
          type,
          list.map((e) => ({
            id: e.id,
            referenceId: e.referenceId,
            partyType: e.partyType,
            partyId: e.partyId,
            partyName: e.partyName,
            amount: parseFloat(e.amount as string),
            direction: e.direction,
            note: e.note,
            date: e.date.toISOString(),
          })),
        ]),
      ),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch day detail" });
  }
});

export default router;
