import { Router } from "express";
import { z } from "zod";
import { db, staffTable, staffLedgerEntriesTable, staffPayslipsTable } from "@workspace/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { appendStaffLedgerEntry, getStaffLedgerSummary } from "../lib/staff-ledger.js";
import { appendGeneralLedgerEntry } from "../lib/general-ledger.js";
import { calculateSalaryForMonth } from "../lib/salary.js";
import { getUserIdFromRequest } from "../lib/auth-context.js";
import { round2 } from "../lib/ledger.js";

const router = Router();

const LedgerEntryType = z.enum(["advance", "deduction", "bonus", "adjustment"]);

const AddLedgerEntryBody = z.object({
  type: LedgerEntryType,
  amount: z.number().positive(),
  description: z.string().optional(),
  entryDate: z.string().optional(), // ISO date/datetime — supports backdating
});

function fmtLedgerEntry(e: typeof staffLedgerEntriesTable.$inferSelect) {
  return {
    id: e.id,
    staffId: e.staffId,
    type: e.type,
    amount: parseFloat(e.amount as string),
    runningBalance: parseFloat(e.runningBalance as string),
    payslipId: e.payslipId,
    description: e.description,
    entryDate: e.entryDate.toISOString(),
    createdAt: e.createdAt.toISOString(),
  };
}

function fmtPayslip(p: typeof staffPayslipsTable.$inferSelect) {
  return {
    id: p.id,
    staffId: p.staffId,
    month: p.month,
    baseSalary: parseFloat(p.baseSalary as string),
    workingDays: p.workingDays,
    daysPresent: parseFloat(p.daysPresent as string),
    daysAbsent: parseFloat(p.daysAbsent as string),
    daysLeave: parseFloat(p.daysLeave as string),
    proratedSalary: parseFloat(p.proratedSalary as string),
    bonus: parseFloat(p.bonus as string),
    deduction: parseFloat(p.deduction as string),
    netSalary: parseFloat(p.netSalary as string),
    notes: p.notes,
    createdAt: p.createdAt.toISOString(),
  };
}

// GET /api/staff/:id/ledger — summary + full entry timeline (date range optional)
router.get("/:id/ledger", async (req, res): Promise<any> => {
  try {
    const staffId = parseInt(req.params.id);
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const summary = await getStaffLedgerSummary(staffId);
    if (!summary) return res.status(404).json({ error: "Staff member not found" });

    const conditions = [eq(staffLedgerEntriesTable.staffId, staffId)];
    if (from) conditions.push(gte(staffLedgerEntriesTable.entryDate, new Date(from)));
    if (to) conditions.push(lte(staffLedgerEntriesTable.entryDate, new Date(to)));

    const entries = await db
      .select()
      .from(staffLedgerEntriesTable)
      .where(and(...conditions))
      .orderBy(desc(staffLedgerEntriesTable.entryDate), desc(staffLedgerEntriesTable.id));

    return res.json({ ...summary, entries: entries.map(fmtLedgerEntry) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch staff ledger" });
  }
});

// POST /api/staff/:id/ledger — add advance/deduction/bonus/adjustment entry (with date picker support)
router.post("/:id/ledger", async (req, res): Promise<any> => {
  try {
    const staffId = parseInt(req.params.id);
    const body = AddLedgerEntryBody.parse(req.body);
    const createdByUserId = getUserIdFromRequest(req);
    const entryDate = body.entryDate ? new Date(body.entryDate) : new Date();

    const [staff] = await db.select().from(staffTable).where(eq(staffTable.id, staffId));
    if (!staff) return res.status(404).json({ error: "Staff member not found" });

    // Sign convention: advance/deduction reduce what we owe (negative);
    // bonus increases it (positive); adjustment is taken as-given by the
    // caller's sign via a `direction` implied by type — advances/deductions
    // are always entered as a positive "amount taken away" by the user, so
    // we flip sign here for those two types.
    const signedAmount = body.type === "advance" || body.type === "deduction" ? -body.amount : body.amount;

    const entry = await db.transaction(async (tx) => {
      const ledgerEntry = await appendStaffLedgerEntry(tx, {
        staffId,
        type: body.type,
        amount: signedAmount,
        description: body.description ?? null,
        createdByUserId,
        entryDate,
      });

      await appendGeneralLedgerEntry(tx, {
        date: entryDate,
        type: body.type === "advance" ? "staff_advance" : body.type === "bonus" ? "salary" : "adjustment",
        referenceId: ledgerEntry.id,
        partyType: "staff",
        partyId: staffId,
        partyName: staff.name,
        amount: body.amount,
        direction: signedAmount < 0 ? "debit" : "credit",
        note: body.description ?? `Staff ${body.type}`,
        createdByUserId,
      });

      return ledgerEntry;
    });

    return res.status(201).json(fmtLedgerEntry(entry));
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues });
    return res.status(500).json({ error: "Failed to add ledger entry" });
  }
});

// ---------------------------------------------------------------------------
// Salary / Payslips
// ---------------------------------------------------------------------------

// GET /api/staff/:id/salary/preview?month=YYYY-MM — calculation breakdown before confirming
router.get("/:id/salary/preview", async (req, res): Promise<any> => {
  try {
    const staffId = parseInt(req.params.id);
    const month = req.query.month as string;
    if (!month) return res.status(400).json({ error: "month (YYYY-MM) is required" });

    const [staff] = await db.select().from(staffTable).where(eq(staffTable.id, staffId));
    if (!staff) return res.status(404).json({ error: "Staff member not found" });

    const [existing] = await db
      .select()
      .from(staffPayslipsTable)
      .where(and(eq(staffPayslipsTable.staffId, staffId), eq(staffPayslipsTable.month, month)));

    const calc = await calculateSalaryForMonth({
      staffId,
      month,
      baseSalary: parseFloat(staff.baseSalary as string),
    });

    return res.json({ ...calc, alreadyFinalized: !!existing, existingPayslip: existing ? fmtPayslip(existing) : null });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to calculate salary preview" });
  }
});

const ConfirmPayslipBody = z.object({
  month: z.string().min(1), // YYYY-MM
  bonus: z.number().nonnegative().default(0),
  deduction: z.number().nonnegative().default(0),
  notes: z.string().optional(),
  markAsPaid: z.boolean().default(true),
  paymentDate: z.string().optional(),
});

// POST /api/staff/:id/salary/confirm — finalize payslip for a month, write ledger entries
router.post("/:id/salary/confirm", async (req, res): Promise<any> => {
  try {
    const staffId = parseInt(req.params.id);
    const body = ConfirmPayslipBody.parse(req.body);
    const createdByUserId = getUserIdFromRequest(req);

    const [staff] = await db.select().from(staffTable).where(eq(staffTable.id, staffId));
    if (!staff) return res.status(404).json({ error: "Staff member not found" });

    const [existing] = await db
      .select()
      .from(staffPayslipsTable)
      .where(and(eq(staffPayslipsTable.staffId, staffId), eq(staffPayslipsTable.month, body.month)));
    if (existing) return res.status(400).json({ error: `Payslip for ${body.month} is already finalized` });

    const calc = await calculateSalaryForMonth({
      staffId,
      month: body.month,
      baseSalary: parseFloat(staff.baseSalary as string),
    });

    const netSalary = round2(calc.proratedSalary + body.bonus - body.deduction);
    const paymentDate = body.paymentDate ? new Date(body.paymentDate) : new Date();

    const result = await db.transaction(async (tx) => {
      const [payslip] = await tx.insert(staffPayslipsTable).values({
        staffId,
        month: body.month,
        baseSalary: String(calc.baseSalary),
        workingDays: calc.workingDays,
        daysPresent: String(calc.daysPresent),
        daysAbsent: String(calc.daysAbsent),
        daysLeave: String(calc.daysLeave),
        proratedSalary: String(calc.proratedSalary),
        bonus: String(body.bonus),
        deduction: String(body.deduction),
        netSalary: String(netSalary),
        notes: body.notes ?? null,
        createdByUserId,
      }).returning();

      // Payslip amount owed to staff (credit to their balance).
      const owedEntry = await appendStaffLedgerEntry(tx, {
        staffId,
        type: "adjustment",
        amount: netSalary,
        payslipId: payslip.id,
        description: `Salary — ${body.month}`,
        createdByUserId,
      });

      let paidEntry = null;
      if (body.markAsPaid) {
        paidEntry = await appendStaffLedgerEntry(tx, {
          staffId,
          type: "salary_payment",
          amount: -netSalary,
          payslipId: payslip.id,
          description: `Salary payment — ${body.month}`,
          createdByUserId,
          entryDate: paymentDate,
        });

        await appendGeneralLedgerEntry(tx, {
          date: paymentDate,
          type: "salary",
          referenceId: payslip.id,
          partyType: "staff",
          partyId: staffId,
          partyName: staff.name,
          amount: netSalary,
          direction: "debit",
          note: `Salary paid — ${body.month}`,
          createdByUserId,
        });
      } else {
        await appendGeneralLedgerEntry(tx, {
          date: new Date(),
          type: "salary",
          referenceId: payslip.id,
          partyType: "staff",
          partyId: staffId,
          partyName: staff.name,
          amount: netSalary,
          direction: "debit",
          note: `Salary finalized (unpaid) — ${body.month}`,
          createdByUserId,
        });
      }

      return { payslip, owedEntry, paidEntry };
    });

    return res.status(201).json({
      payslip: fmtPayslip(result.payslip),
      isPaid: body.markAsPaid,
    });
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues });
    return res.status(500).json({ error: "Failed to confirm payslip" });
  }
});

// GET /api/staff/:id/salary/history — list past payslips
router.get("/:id/salary/history", async (req, res): Promise<any> => {
  try {
    const staffId = parseInt(req.params.id);
    const rows = await db
      .select()
      .from(staffPayslipsTable)
      .where(eq(staffPayslipsTable.staffId, staffId))
      .orderBy(desc(staffPayslipsTable.month));
    return res.json(rows.map(fmtPayslip));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch salary history" });
  }
});

export default router;
