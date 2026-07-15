import { Router, type IRouter } from "express";
import { db, customersTable, ledgerEntriesTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { round2 } from "../lib/ledger.js";

// ---------------------------------------------------------------------------
// TEMPORARY one-time repair endpoint.
//
// Fixes historical customer ledger running balances that drifted because
// appendLedgerEntry() used to chain off insertion order instead of
// chronological (entryDate) order — see lib/ledger.ts for the permanent
// fix, which now keeps every new entry correct going forward. This route
// backfills the correction for data that already existed before that fix.
//
// Runs entirely through the browser (GET request), no CLI/terminal needed.
// Protected by the JWT_SECRET env var as a query key so it can't be hit by
// anyone else.
//
// Usage:
//   https://<your-backend>.vercel.app/api/repair-ledger?key=<JWT_SECRET>              -> dry run, reports drift only
//   https://<your-backend>.vercel.app/api/repair-ledger?key=<JWT_SECRET>&apply=true   -> applies the fix
//
// DELETE THIS FILE (and its registration in routes/index.ts) once you've
// run it with apply=true and confirmed the ledger looks correct.
// ---------------------------------------------------------------------------

const router: IRouter = Router();

router.get("/repair-ledger", async (req, res): Promise<any> => {
  try {
    const key = req.query.key as string | undefined;
    if (!key || key !== process.env.JWT_SECRET) {
      return res.status(403).json({ error: "Forbidden. Pass ?key=<JWT_SECRET> in the URL." });
    }

    const apply = req.query.apply === "true";

    const customers = await db.select({ id: customersTable.id, name: customersTable.name, openingBalance: customersTable.openingBalance }).from(customersTable).orderBy(asc(customersTable.id));

    const report: Array<{
      customerId: number;
      customerName: string;
      fixes: Array<{ entryId: number; entryDate: string; storedBalance: number; correctBalance: number }>;
    }> = [];

    let totalEntriesFixed = 0;

    for (const customer of customers) {
      const entries = await db
        .select()
        .from(ledgerEntriesTable)
        .where(eq(ledgerEntriesTable.customerId, customer.id))
        .orderBy(asc(ledgerEntriesTable.entryDate), asc(ledgerEntriesTable.id));

      if (entries.length === 0) continue;

      let runningBalance = parseFloat(customer.openingBalance as string);
      const fixes: Array<{ entryId: number; entryDate: string; storedBalance: number; correctBalance: number }> = [];

      for (const entry of entries) {
        runningBalance = round2(runningBalance + parseFloat(entry.amount as string));
        const storedBalance = parseFloat(entry.runningBalance as string);

        if (Math.abs(runningBalance - storedBalance) > 0.005) {
          fixes.push({
            entryId: entry.id,
            entryDate: entry.entryDate.toISOString(),
            storedBalance,
            correctBalance: runningBalance,
          });

          if (apply) {
            await db.update(ledgerEntriesTable).set({ runningBalance: String(runningBalance) }).where(eq(ledgerEntriesTable.id, entry.id));
          }
        }
      }

      if (fixes.length > 0) {
        report.push({ customerId: customer.id, customerName: customer.name, fixes });
        totalEntriesFixed += fixes.length;
      }
    }

    return res.json({
      mode: apply ? "APPLIED" : "DRY_RUN",
      customersWithDrift: report.length,
      entriesFixed: totalEntriesFixed,
      details: report,
      note: apply
        ? "Corrected balances have been written."
        : "This was a dry run — no changes were made. Add &apply=true to the URL to write the fix.",
    });
  } catch (error) {
    console.error("repair-ledger failed", error);
    return res.status(500).json({ error: "Repair failed", detail: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
