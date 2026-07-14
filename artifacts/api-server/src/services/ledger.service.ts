import { db } from "@workspace/db";
import { generalLedgerEntriesTable } from "@workspace/db";
import { and, eq, gte, lte, desc, sql } from "drizzle-orm";

export type LedgerEntryParams = {
  date?: Date;
  type: string;
  referenceId?: number | null;
  partyType?: string | null;
  partyId?: number | null;
  partyName?: string | null;
  amount: number;
  direction: "credit" | "debit";
  note?: string | null;
  createdByUserId?: number | null;
};

export async function recordEntry(params: LedgerEntryParams, tx?: any) {
  const insertTarget = tx ?? db;
  const result = await insertTarget.insert(generalLedgerEntriesTable).values({
    date: params.date ?? new Date(),
    type: params.type,
    referenceId: params.referenceId ?? null,
    partyType: params.partyType ?? "none",
    partyId: params.partyId ?? null,
    partyName: params.partyName ?? null,
    amount: String(params.amount),
    direction: params.direction,
    note: params.note ?? null,
    createdByUserId: params.createdByUserId ?? null,
  }).returning();
  return result?.[0] ?? null;
}

export async function listEntries(filters: { type?: string; partyType?: string; partyId?: number; from?: string; to?: string; page?: number; limit?: number }) {
  const { type, partyType, partyId, from, to, page = 1, limit = 50 } = filters;
  const offset = (page - 1) * limit;

  const conditions: any[] = [];
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

  return {
    data: rows.map((e: any) => ({
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
    })),
    total: Number(count),
    page,
    limit,
    totalCredit,
    totalDebit,
    netBalance: Math.round((totalCredit - totalDebit) * 100) / 100,
  };
}

export default { recordEntry, listEntries };
