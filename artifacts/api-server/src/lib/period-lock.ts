import { db, financialPeriodsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { DbTx } from "./ledger.js";

/**
 * Throws if `date` falls inside a month that has already been closed. Call
 * this before writing any sale, purchase, payment, or expense so that
 * closed months can never be silently changed underneath their saved
 * snapshot. To edit something in a closed month, the month must be
 * re-opened first (see months.service.ts `reopenMonth`), which flags the
 * period `updatedAfterClosing = true` so it's obvious the closing snapshot
 * is now stale and should be recomputed.
 */
export async function assertPeriodOpen(date: Date, client: typeof db | DbTx = db) {
  if (!client) return;
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const [period] = await client
    .select({ status: financialPeriodsTable.status })
    .from(financialPeriodsTable)
    .where(and(eq(financialPeriodsTable.year, year), eq(financialPeriodsTable.month, month)));

  if (period && period.status === "closed") {
    throw new Error(
      `This entry falls in ${year}-${String(month).padStart(2, "0")}, which is already closed. Reopen that month first (Months page) before adding or editing entries in it.`,
    );
  }
}

/**
 * Marks the financial period containing `date` as having been modified
 * after its snapshot was taken. Used so the Months page can visibly flag
 * "this closed month's numbers no longer match its snapshot" rather than
 * silently going stale. Only has any effect on a period that is currently
 * closed (i.e. one that was reopened and then edited) — writing to an
 * open period is a no-op since there's no snapshot to go stale yet.
 */
export async function markPeriodDirty(date: Date, client: DbTx) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  await client
    .update(financialPeriodsTable)
    .set({ updatedAfterClosing: true, updatedAt: new Date() })
    .where(and(eq(financialPeriodsTable.year, year), eq(financialPeriodsTable.month, month), eq(financialPeriodsTable.status, "closed")));
}
