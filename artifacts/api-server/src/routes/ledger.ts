import { Router } from "express";
import { z } from "zod";
import { db, customersTable, ledgerEntriesTable, generalLedgerEntriesTable } from "@workspace/db";
import { eq, and, gte, lte, asc, desc, sql } from "drizzle-orm";
import { appendLedgerEntry, getCustomerLedgerSummary, recomputeCustomerLedgerRunningBalances, round2 } from "../lib/ledger.js";
import { appendGeneralLedgerEntry } from "../lib/general-ledger.js";
import { getUserIdFromRequest } from "../lib/auth-context.js";

const router = Router();

const AddAdjustmentBody = z.object({
  type: z.enum(["return", "adjustment"]),
  amount: z.number().positive(),
  description: z.string().optional(),
  entryDate: z.string().optional(),
});

const EditAdjustmentBody = z.object({
  type: z.enum(["return", "adjustment"]).optional(),
  amount: z.number().positive().optional(),
  description: z.string().optional(),
  entryDate: z.string().optional(),
});

function fmtLedgerEntry(e: typeof ledgerEntriesTable.$inferSelect) {
  return {
    id: e.id,
    customerId: e.customerId,
    type: e.type,
    amount: parseFloat(e.amount as string),
    runningBalance: parseFloat(e.runningBalance as string),
    saleId: e.saleId,
    paymentId: e.paymentId,
    description: e.description,
    entryDate: e.entryDate.toISOString(),
    createdAt: e.createdAt.toISOString(),
  };
}

/** GET /api/customers/:id/ledger — the Customer Dashboard summary (section 6/7). */
router.get("/:id/ledger", async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const summary = await getCustomerLedgerSummary(customerId);
    if (!summary) return res.status(404).json({ error: "Customer not found" });
    return res.json(summary);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch customer ledger" });
  }
});

/** GET /api/customers/:id/ledger/timeline — chronological Invoice/Payment feed (section 9). */
router.get("/:id/ledger/timeline", async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 25;
    const offset = (page - 1) * limit;

    const entries = await db
      .select()
      .from(ledgerEntriesTable)
      .where(eq(ledgerEntriesTable.customerId, customerId))
      .orderBy(desc(ledgerEntriesTable.entryDate), desc(ledgerEntriesTable.id))
      .limit(limit)
      .offset(offset);

    return res.json({
      data: entries.map((e) => ({
        id: e.id,
        type: e.type,
        amount: parseFloat(e.amount as string),
        runningBalance: parseFloat(e.runningBalance as string),
        saleId: e.saleId,
        paymentId: e.paymentId,
        description: e.description,
        date: e.entryDate.toISOString(),
      })),
      page,
      limit,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch ledger timeline" });
  }
});

/**
 * GET /api/customers/:id/statement?from=&to=
 * Section 5 — Customer Statement data (opening balance, invoices, payments,
 * adjustments, running/closing balance). PDF/Excel rendering can be added
 * as a thin export layer on top of this same payload (see pdf/xlsx skills).
 */
router.get("/:id/statement", async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, customerId));
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const from = req.query.from ? new Date(req.query.from as string) : null;
    const to = req.query.to ? new Date(req.query.to as string) : null;

    const conditions = [eq(ledgerEntriesTable.customerId, customerId)];
    if (from) conditions.push(gte(ledgerEntriesTable.entryDate, from));
    if (to) conditions.push(lte(ledgerEntriesTable.entryDate, to));

    const entries = await db
      .select()
      .from(ledgerEntriesTable)
      .where(and(...conditions))
      .orderBy(asc(ledgerEntriesTable.entryDate), asc(ledgerEntriesTable.id));

    // Opening balance for the statement window = the running balance just
    // before the first entry in range (or the customer's true opening
    // balance if the window starts at the beginning of their history).
    let openingBalance = parseFloat(customer.openingBalance as string);
    if (from) {
      const [priorEntry] = await db
        .select({ runningBalance: ledgerEntriesTable.runningBalance })
        .from(ledgerEntriesTable)
        .where(and(eq(ledgerEntriesTable.customerId, customerId), lte(ledgerEntriesTable.entryDate, from)))
        .orderBy(desc(ledgerEntriesTable.entryDate), desc(ledgerEntriesTable.id))
        .limit(1);
      if (priorEntry) openingBalance = parseFloat(priorEntry.runningBalance as string);
    }

    const closingBalance = entries.length > 0 ? parseFloat(entries[entries.length - 1].runningBalance as string) : openingBalance;
    const totalInvoiced = round2(entries.filter((e) => e.type === "sale").reduce((s, e) => s + parseFloat(e.amount as string), 0));
    const totalPaid = round2(Math.abs(entries.filter((e) => e.type === "payment").reduce((s, e) => s + parseFloat(e.amount as string), 0)));

    return res.json({
      customer: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email, address: customer.address },
      periodFrom: from?.toISOString() ?? null,
      periodTo: to?.toISOString() ?? null,
      openingBalance: round2(openingBalance),
      closingBalance: round2(closingBalance),
      totalInvoiced,
      totalPaid,
      lines: entries.map((e) => ({
        date: e.entryDate.toISOString(),
        type: e.type,
        description: e.description,
        amount: parseFloat(e.amount as string),
        runningBalance: parseFloat(e.runningBalance as string),
      })),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to generate statement" });
  }
});

/** GET /api/customers/ledger/reports/outstanding — Outstanding Report across all customers (section 11). */
router.get("/ledger/reports/outstanding", async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT c.id, c.name, c.phone, c.credit_limit,
             COALESCE(SUM(s.total - s.amount_paid) FILTER (WHERE s.status = 'completed'), 0) AS outstanding,
             COUNT(*) FILTER (WHERE s.status = 'completed' AND (s.total - s.amount_paid) > 0.005) AS pending_invoices,
             MIN(s.created_at) FILTER (WHERE s.status = 'completed' AND (s.total - s.amount_paid) > 0.005) AS oldest_unpaid_date
      FROM customers c
      LEFT JOIN sales s ON s.customer_id = c.id
      GROUP BY c.id, c.name, c.phone, c.credit_limit
      HAVING COALESCE(SUM(s.total - s.amount_paid) FILTER (WHERE s.status = 'completed'), 0) > 0.005
      ORDER BY outstanding DESC
    `);
    const data = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];
    return res.json({
      data: data.map((r) => ({
        customerId: r.id,
        customerName: r.name,
        phone: r.phone,
        creditLimit: parseFloat(r.credit_limit as string),
        outstanding: round2(parseFloat(r.outstanding as string)),
        pendingInvoices: Number(r.pending_invoices),
        oldestUnpaidDate: r.oldest_unpaid_date,
        overdueDays: r.oldest_unpaid_date
          ? Math.floor((Date.now() - new Date(r.oldest_unpaid_date as string).getTime()) / 86400000)
          : 0,
      })),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to generate outstanding report" });
  }
});

/** POST /api/customers/:id/ledger — manual return/adjustment entry (with date picker). Mirrors supplier-ledger.ts. */
router.post("/:id/ledger", async (req, res): Promise<any> => {
  try {
    const customerId = parseInt(req.params.id);
    const body = AddAdjustmentBody.parse(req.body);
    const createdByUserId = getUserIdFromRequest(req);
    const entryDate = body.entryDate ? new Date(body.entryDate) : new Date();

    const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, customerId));
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    // Returns/credits reduce what the customer owes us.
    const signedAmount = -body.amount;

    const entry = await db.transaction(async (tx) => {
      try {
        const months = await import("../services/months.service.js");
        if (await months.isDateInClosedPeriod(entryDate)) {
          throw new months.MonthClosedError(entryDate);
        }
      } catch (err) {
        if (err && (err as Error).name === "MonthClosedError") throw err;
      }

      const ledgerEntry = await appendLedgerEntry(tx, {
        customerId,
        type: body.type,
        amount: signedAmount,
        description: body.description ?? null,
        createdByUserId,
        entryDate,
      });

      await recomputeCustomerLedgerRunningBalances(tx, customerId);

      // A return/credit to the customer's account is cash leaving hand
      // (a refund) — the mirror of a supplier return, which is cash
      // effectively coming back to us.
      await appendGeneralLedgerEntry(tx, {
        date: entryDate,
        type: "adjustment",
        referenceId: ledgerEntry.id,
        partyType: "customer",
        partyId: customerId,
        partyName: customer.name,
        amount: body.amount,
        direction: "debit",
        note: body.description ?? `Customer ${body.type}`,
        createdByUserId,
      });

      return ledgerEntry;
    });

    return res.status(201).json(fmtLedgerEntry(entry));
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues });
    if (error && (error as Error).name === "MonthClosedError") return res.status(409).json({ error: (error as Error).message });
    return res.status(500).json({ error: "Failed to add ledger entry" });
  }
});

/** PATCH /api/customers/:id/ledger/:entryId — edit a manual return/adjustment entry. */
router.patch("/:id/ledger/:entryId", async (req, res): Promise<any> => {
  try {
    const customerId = parseInt(req.params.id);
    const entryId = parseInt(req.params.entryId);
    const body = EditAdjustmentBody.parse(req.body);

    const [existingEntry] = await db
      .select()
      .from(ledgerEntriesTable)
      .where(and(eq(ledgerEntriesTable.id, entryId), eq(ledgerEntriesTable.customerId, customerId)));

    if (!existingEntry) return res.status(404).json({ error: "Ledger entry not found" });
    if (existingEntry.saleId || existingEntry.paymentId || !["return", "adjustment"].includes(existingEntry.type)) {
      return res.status(400).json({ error: "Only manual return/adjustment entries can be edited" });
    }

    const updateValues: Partial<{ type: "return" | "adjustment"; amount: string; description: string | null; entryDate: Date }> = {};
    if (body.type) updateValues.type = body.type;
    if (body.amount !== undefined) updateValues.amount = String(round2(-body.amount));
    if (body.description !== undefined) updateValues.description = body.description ?? null;
    if (body.entryDate !== undefined) updateValues.entryDate = new Date(body.entryDate);

    if (Object.keys(updateValues).length === 0) return res.status(400).json({ error: "No changes provided" });

    const effectiveEntryDate = updateValues.entryDate ?? new Date(existingEntry.entryDate);
    try {
      const months = await import("../services/months.service.js");
      if (await months.isDateInClosedPeriod(effectiveEntryDate)) {
        throw new months.MonthClosedError(effectiveEntryDate);
      }
    } catch (err) {
      if (err && (err as Error).name === "MonthClosedError") throw err;
    }

    await db.transaction(async (tx) => {
      await tx.update(ledgerEntriesTable).set(updateValues).where(eq(ledgerEntriesTable.id, entryId));
      await recomputeCustomerLedgerRunningBalances(tx, customerId);

      await tx
        .update(generalLedgerEntriesTable)
        .set({
          amount: String(round2(body.amount !== undefined ? body.amount : Math.abs(parseFloat(existingEntry.amount as string)))),
          date: effectiveEntryDate,
          note: body.description ?? existingEntry.description,
          type: "adjustment",
        })
        .where(and(
          eq(generalLedgerEntriesTable.referenceId, entryId),
          eq(generalLedgerEntriesTable.partyType, "customer"),
          eq(generalLedgerEntriesTable.partyId, customerId),
          eq(generalLedgerEntriesTable.type, "adjustment"),
        ));
    });

    const [updatedEntry] = await db.select().from(ledgerEntriesTable).where(eq(ledgerEntriesTable.id, entryId));
    return res.json(fmtLedgerEntry(updatedEntry));
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues });
    return res.status(500).json({ error: "Failed to edit ledger entry" });
  }
});

/** DELETE /api/customers/:id/ledger/:entryId — delete a manual return/adjustment entry. */
router.delete("/:id/ledger/:entryId", async (req, res): Promise<any> => {
  try {
    const customerId = parseInt(req.params.id);
    const entryId = parseInt(req.params.entryId);

    const [existingEntry] = await db
      .select()
      .from(ledgerEntriesTable)
      .where(and(eq(ledgerEntriesTable.id, entryId), eq(ledgerEntriesTable.customerId, customerId)));

    if (!existingEntry) return res.status(404).json({ error: "Ledger entry not found" });
    if (existingEntry.saleId || existingEntry.paymentId || !["return", "adjustment"].includes(existingEntry.type)) {
      return res.status(400).json({ error: "Only manual return/adjustment entries can be deleted" });
    }

    try {
      const months = await import("../services/months.service.js");
      if (await months.isDateInClosedPeriod(existingEntry.entryDate)) {
        throw new months.MonthClosedError(existingEntry.entryDate);
      }
    } catch (err) {
      if (err && (err as Error).name === "MonthClosedError") return res.status(409).json({ error: "Financial period is closed for this entry date" });
    }

    await db.transaction(async (tx) => {
      await tx.delete(ledgerEntriesTable).where(eq(ledgerEntriesTable.id, entryId));

      await tx
        .delete(generalLedgerEntriesTable)
        .where(and(
          eq(generalLedgerEntriesTable.referenceId, entryId),
          eq(generalLedgerEntriesTable.partyType, "customer"),
          eq(generalLedgerEntriesTable.partyId, customerId),
          eq(generalLedgerEntriesTable.type, "adjustment"),
        ));

      await recomputeCustomerLedgerRunningBalances(tx, customerId);
    });

    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to delete ledger entry" });
  }
});

export default router;
