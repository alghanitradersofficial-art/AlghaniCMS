import { Router } from "express";
import { db, generalLedgerEntriesTable } from "@workspace/db";
import { and, eq, gte, lte, desc, sql } from "drizzle-orm";

const router = Router();

function fmt(e: typeof generalLedgerEntriesTable.$inferSelect) {
  return {
    id: e.id,
    date: e.date.toISOString(),
    type: e.type,
    referenceId: e.referenceId,
    partyType: e.partyType,
    partyId: e.partyId,
    partyName: e.partyName,
    amount: parseFloat(e.amount as string),
    direction: e.direction,
    note: e.note,
    createdAt: e.createdAt.toISOString(),
  };
}

// GET /api/general-ledger?type=&partyType=&partyId=&from=&to=&page=&limit=
router.get("/", async (req, res): Promise<any> => {
  try {
    const type = req.query.type as string | undefined;
    const partyType = req.query.partyType as string | undefined;
    const partyId = req.query.partyId ? parseInt(req.query.partyId as string) : undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (type) conditions.push(eq(generalLedgerEntriesTable.type, type));
    if (partyType) conditions.push(eq(generalLedgerEntriesTable.partyType, partyType));
    if (partyId) conditions.push(eq(generalLedgerEntriesTable.partyId, partyId));
    if (from) conditions.push(gte(generalLedgerEntriesTable.date, new Date(from)));
    if (to) conditions.push(lte(generalLedgerEntriesTable.date, new Date(to)));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(generalLedgerEntriesTable).where(whereClause);

    const rows = await db
      .select()
      .from(generalLedgerEntriesTable)
      .where(whereClause)
      .orderBy(desc(generalLedgerEntriesTable.date), desc(generalLedgerEntriesTable.id))
      .limit(limit)
      .offset(offset);

    const [totals] = await db
      .select({
        totalCredit: sql<string>`COALESCE(SUM(${generalLedgerEntriesTable.amount}) FILTER (WHERE ${generalLedgerEntriesTable.direction} = 'credit'), 0)`,
        totalDebit: sql<string>`COALESCE(SUM(${generalLedgerEntriesTable.amount}) FILTER (WHERE ${generalLedgerEntriesTable.direction} = 'debit'), 0)`,
      })
      .from(generalLedgerEntriesTable)
      .where(whereClause);

    const totalCredit = parseFloat(totals?.totalCredit ?? "0");
    const totalDebit = parseFloat(totals?.totalDebit ?? "0");

    return res.json({
      data: rows.map(fmt),
      total: Number(count),
      page,
      limit,
      totalCredit,
      totalDebit,
      netBalance: Math.round((totalCredit - totalDebit) * 100) / 100,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch ledger" });
  }
});

export default router;
