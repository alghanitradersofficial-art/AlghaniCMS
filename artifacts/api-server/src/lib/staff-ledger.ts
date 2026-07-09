import { db, staffTable, staffLedgerEntriesTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import type { DbTx } from "./ledger.js";
import { round2 } from "./ledger.js";

export type StaffLedgerEntryType =
  | "salary_payment"
  | "advance"
  | "deduction"
  | "bonus"
  | "adjustment"
  | "opening_balance";

/**
 * Appends one immutable ledger entry for a staff member, computing its
 * running balance from the previous entry. Row-locks the staff record for
 * the duration of the transaction so concurrent writes for the same staff
 * member can't race. Mirrors appendLedgerEntry in lib/ledger.ts.
 *
 * Sign convention: positive amount increases what we owe the staff member
 * (e.g. a finalized payslip / bonus); negative decreases it (a salary
 * payment made, an advance given, a deduction).
 *
 * MUST be called from inside a `db.transaction(async (tx) => { ... })` block.
 */
export async function appendStaffLedgerEntry(
  tx: DbTx,
  params: {
    staffId: number;
    type: StaffLedgerEntryType;
    amount: number;
    payslipId?: number | null;
    description?: string | null;
    createdByUserId?: number | null;
    entryDate?: Date;
  },
) {
  const lockResult = await tx.execute(
    sql`SELECT id FROM staff WHERE id = ${params.staffId} FOR UPDATE`,
  );
  const staffRow = (lockResult as unknown as { rows: Array<{ id: number }> }).rows?.[0];
  if (!staffRow) {
    throw new Error(`Staff member ${params.staffId} not found`);
  }

  const [lastEntry] = await tx
    .select({ runningBalance: staffLedgerEntriesTable.runningBalance })
    .from(staffLedgerEntriesTable)
    .where(eq(staffLedgerEntriesTable.staffId, params.staffId))
    .orderBy(desc(staffLedgerEntriesTable.id))
    .limit(1);

  const previousBalance = lastEntry ? parseFloat(lastEntry.runningBalance as string) : 0;
  const runningBalance = round2(previousBalance + params.amount);

  const [entry] = await tx
    .insert(staffLedgerEntriesTable)
    .values({
      staffId: params.staffId,
      type: params.type,
      amount: String(round2(params.amount)),
      runningBalance: String(runningBalance),
      payslipId: params.payslipId ?? null,
      description: params.description ?? null,
      createdByUserId: params.createdByUserId ?? null,
      entryDate: params.entryDate ?? new Date(),
    })
    .returning();

  return entry;
}

/**
 * Read-side summary for a staff member's ledger — current balance and
 * lifetime totals by entry type. Safe to call outside a transaction.
 */
export async function getStaffLedgerSummary(staffId: number) {
  const [staff] = await db.select().from(staffTable).where(eq(staffTable.id, staffId));
  if (!staff) return null;

  const [lastEntry] = await db
    .select()
    .from(staffLedgerEntriesTable)
    .where(eq(staffLedgerEntriesTable.staffId, staffId))
    .orderBy(desc(staffLedgerEntriesTable.id))
    .limit(1);

  const currentBalance = lastEntry ? parseFloat(lastEntry.runningBalance as string) : 0;

  const [agg] = await db
    .select({
      totalPaid: sql<string>`COALESCE(SUM(-${staffLedgerEntriesTable.amount}) FILTER (WHERE ${staffLedgerEntriesTable.type} = 'salary_payment'), 0)`,
      totalAdvances: sql<string>`COALESCE(SUM(-${staffLedgerEntriesTable.amount}) FILTER (WHERE ${staffLedgerEntriesTable.type} = 'advance'), 0)`,
      totalBonus: sql<string>`COALESCE(SUM(${staffLedgerEntriesTable.amount}) FILTER (WHERE ${staffLedgerEntriesTable.type} = 'bonus'), 0)`,
      totalDeductions: sql<string>`COALESCE(SUM(-${staffLedgerEntriesTable.amount}) FILTER (WHERE ${staffLedgerEntriesTable.type} = 'deduction'), 0)`,
    })
    .from(staffLedgerEntriesTable)
    .where(eq(staffLedgerEntriesTable.staffId, staffId));

  return {
    staffId,
    currentBalance: round2(currentBalance), // positive = we owe staff, negative = advance outstanding against them
    owedToStaff: currentBalance > 0 ? round2(currentBalance) : 0,
    advanceOutstanding: currentBalance < 0 ? round2(Math.abs(currentBalance)) : 0,
    totalPaid: round2(parseFloat(agg?.totalPaid ?? "0")),
    totalAdvances: round2(parseFloat(agg?.totalAdvances ?? "0")),
    totalBonus: round2(parseFloat(agg?.totalBonus ?? "0")),
    totalDeductions: round2(parseFloat(agg?.totalDeductions ?? "0")),
  };
}
