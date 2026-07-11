import { Router } from "express";
import { z } from "zod";
import { db, suppliersTable, supplierLedgerEntriesTable, supplierPaymentsTable, purchasesTable, generalLedgerEntriesTable } from "@workspace/db";
import { eq, and, gte, lte, desc, asc, sql } from "drizzle-orm";
import { appendSupplierLedgerEntry, allocateSupplierPayment, getSupplierLedgerSummary, recomputeSupplierLedgerRunningBalances } from "../lib/supplier-ledger.js";
import { appendGeneralLedgerEntry } from "../lib/general-ledger.js";
import { getUserIdFromRequest } from "../lib/auth-context.js";
import { round2 } from "../lib/ledger.js";

const router = Router();

const PaymentMethod = z.enum(["cash", "bank_transfer", "cheque", "jazzcash", "easypaisa", "other"]);

const CreateSupplierPaymentBody = z.object({
  amount: z.number().positive(),
  method: PaymentMethod.default("cash"),
  bankName: z.string().optional(),
  chequeNumber: z.string().optional(),
  transactionId: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  paymentDate: z.string().optional(), // supports backdating
  allocations: z.array(z.object({ purchaseId: z.number().int().positive(), amount: z.number().positive() })).optional(),
});

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

function fmtLedgerEntry(e: typeof supplierLedgerEntriesTable.$inferSelect) {
  return {
    id: e.id,
    supplierId: e.supplierId,
    type: e.type,
    amount: parseFloat(e.amount as string),
    runningBalance: parseFloat(e.runningBalance as string),
    purchaseId: e.purchaseId,
    paymentId: e.paymentId,
    description: e.description,
    entryDate: e.entryDate.toISOString(),
    createdAt: e.createdAt.toISOString(),
  };
}

function fmtPayment(p: typeof supplierPaymentsTable.$inferSelect) {
  return {
    id: p.id,
    supplierId: p.supplierId,
    amount: parseFloat(p.amount as string),
    method: p.method,
    bankName: p.bankName,
    chequeNumber: p.chequeNumber,
    transactionId: p.transactionId,
    reference: p.reference,
    notes: p.notes,
    isVoided: p.isVoided,
    voidReason: p.voidReason,
    paymentDate: p.paymentDate.toISOString(),
    createdAt: p.createdAt.toISOString(),
  };
}

// GET /api/suppliers/:id/ledger — summary + entry timeline, date-range filterable
router.get("/:id/ledger", async (req, res): Promise<any> => {
  try {
    const supplierId = parseInt(req.params.id);
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const summary = await getSupplierLedgerSummary(supplierId);
    if (!summary) return res.status(404).json({ error: "Supplier not found" });

    const conditions = [eq(supplierLedgerEntriesTable.supplierId, supplierId)];
    if (from) conditions.push(gte(supplierLedgerEntriesTable.entryDate, new Date(from)));
    if (to) conditions.push(lte(supplierLedgerEntriesTable.entryDate, new Date(to)));

    const entries = await db
      .select()
      .from(supplierLedgerEntriesTable)
      .where(and(...conditions))
      .orderBy(desc(supplierLedgerEntriesTable.entryDate), desc(supplierLedgerEntriesTable.id));

    return res.json({ ...summary, entries: entries.map(fmtLedgerEntry) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch supplier ledger" });
  }
});

// POST /api/suppliers/:id/ledger — manual return/adjustment entry (with date picker)
router.post("/:id/ledger", async (req, res): Promise<any> => {
  try {
    const supplierId = parseInt(req.params.id);
    const body = AddAdjustmentBody.parse(req.body);
    const createdByUserId = getUserIdFromRequest(req);
    const entryDate = body.entryDate ? new Date(body.entryDate) : new Date();

    const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });

    // Returns/credits reduce what we owe the supplier.
    const signedAmount = -body.amount;

    const entry = await db.transaction(async (tx) => {
      const ledgerEntry = await appendSupplierLedgerEntry(tx, {
        supplierId,
        type: body.type,
        amount: signedAmount,
        description: body.description ?? null,
        createdByUserId,
        entryDate,
      });

      await appendGeneralLedgerEntry(tx, {
        date: entryDate,
        type: "adjustment",
        referenceId: ledgerEntry.id,
        partyType: "supplier",
        partyId: supplierId,
        partyName: supplier.name,
        amount: body.amount,
        direction: "credit",
        note: body.description ?? `Supplier ${body.type}`,
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

// PATCH /api/suppliers/:id/ledger/:entryId — edit a manual return/adjustment ledger entry
router.patch("/:id/ledger/:entryId", async (req, res): Promise<any> => {
  try {
    const supplierId = parseInt(req.params.id);
    const entryId = parseInt(req.params.entryId);
    const body = EditAdjustmentBody.parse(req.body);

    const [existingEntry] = await db
      .select()
      .from(supplierLedgerEntriesTable)
      .where(and(eq(supplierLedgerEntriesTable.id, entryId), eq(supplierLedgerEntriesTable.supplierId, supplierId)));

    if (!existingEntry) {
      return res.status(404).json({ error: "Ledger entry not found" });
    }

    if (existingEntry.purchaseId || existingEntry.paymentId || !["return", "adjustment"].includes(existingEntry.type)) {
      return res.status(400).json({ error: "Only manual return/adjustment entries can be edited" });
    }

    const updateValues: Record<string, unknown> = {};
    if (body.type) updateValues.type = body.type;
    if (body.amount !== undefined) updateValues.amount = String(round2(-body.amount));
    if (body.description !== undefined) updateValues.description = body.description ?? null;
    if (body.entryDate !== undefined) updateValues.entryDate = new Date(body.entryDate);

    if (Object.keys(updateValues).length === 0) {
      return res.status(400).json({ error: "No changes provided" });
    }

    await db.transaction(async (tx) => {
      await tx
        .update(supplierLedgerEntriesTable)
        .set(updateValues)
        .where(eq(supplierLedgerEntriesTable.id, entryId));

      await recomputeSupplierLedgerRunningBalances(tx, supplierId);

      await tx
        .update(generalLedgerEntriesTable)
        .set({
          amount: String(round2(body.amount !== undefined ? body.amount : Math.abs(parseFloat(existingEntry.amount as string)))),
          date: updateValues.entryDate ?? existingEntry.entryDate,
          note: body.description ?? existingEntry.description,
          type: "adjustment",
        })
        .where(and(
          eq(generalLedgerEntriesTable.referenceId, entryId),
          eq(generalLedgerEntriesTable.partyType, "supplier"),
          eq(generalLedgerEntriesTable.partyId, supplierId),
          eq(generalLedgerEntriesTable.type, "adjustment"),
        ));
    });

    const [updatedEntry] = await db
      .select()
      .from(supplierLedgerEntriesTable)
      .where(eq(supplierLedgerEntriesTable.id, entryId));

    return res.json(fmtLedgerEntry(updatedEntry));
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues });
    return res.status(500).json({ error: "Failed to edit ledger entry" });
  }
});

// DELETE /api/suppliers/:id/ledger/:entryId — delete a manual return/adjustment ledger entry
router.delete("/:id/ledger/:entryId", async (req, res): Promise<any> => {
  try {
    const supplierId = parseInt(req.params.id);
    const entryId = parseInt(req.params.entryId);

    const [existingEntry] = await db
      .select()
      .from(supplierLedgerEntriesTable)
      .where(and(eq(supplierLedgerEntriesTable.id, entryId), eq(supplierLedgerEntriesTable.supplierId, supplierId)));

    if (!existingEntry) {
      return res.status(404).json({ error: "Ledger entry not found" });
    }

    if (existingEntry.purchaseId || existingEntry.paymentId || !["return", "adjustment"].includes(existingEntry.type)) {
      return res.status(400).json({ error: "Only manual return/adjustment entries can be deleted" });
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(supplierLedgerEntriesTable)
        .where(eq(supplierLedgerEntriesTable.id, entryId));

      await tx
        .delete(generalLedgerEntriesTable)
        .where(and(
          eq(generalLedgerEntriesTable.referenceId, entryId),
          eq(generalLedgerEntriesTable.partyType, "supplier"),
          eq(generalLedgerEntriesTable.partyId, supplierId),
          eq(generalLedgerEntriesTable.type, "adjustment"),
        ));

      await recomputeSupplierLedgerRunningBalances(tx, supplierId);
    });

    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to delete ledger entry" });
  }
});

// POST /api/suppliers/:id/payments — record a payment made to this supplier
router.post("/:id/payments", async (req, res): Promise<any> => {
  try {
    const supplierId = parseInt(req.params.id);
    const body = CreateSupplierPaymentBody.parse(req.body);
    const paidByUserId = getUserIdFromRequest(req);
    const paymentDate = body.paymentDate ? new Date(body.paymentDate) : new Date();

    const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });

    const payment = await db.transaction(async (tx) => {
      const ledgerEntry = await appendSupplierLedgerEntry(tx, {
        supplierId,
        type: "payment",
        amount: -body.amount,
        description: body.reference ? `Payment — ${body.reference}` : "Payment made",
        createdByUserId: paidByUserId,
        entryDate: paymentDate,
      });

      const validAllocations = (body.allocations ?? [])
        .filter((a): a is { purchaseId: number; amount: number } => typeof a.purchaseId === "number" && typeof a.amount === "number");

      await allocateSupplierPayment(tx, {
        supplierId,
        amount: body.amount,
        explicitAllocations: validAllocations.length > 0 ? validAllocations : undefined,
      });

      const [inserted] = await tx.insert(supplierPaymentsTable).values({
        supplierId,
        amount: String(body.amount),
        method: body.method,
        bankName: body.bankName ?? null,
        chequeNumber: body.chequeNumber ?? null,
        transactionId: body.transactionId ?? null,
        reference: body.reference ?? null,
        notes: body.notes ?? null,
        paidByUserId,
        paymentDate,
      }).returning();

      await tx.update(supplierLedgerEntriesTable)
        .set({ paymentId: inserted.id })
        .where(eq(supplierLedgerEntriesTable.id, ledgerEntry.id));

      await appendGeneralLedgerEntry(tx, {
        date: paymentDate,
        type: "supplier_payment",
        referenceId: inserted.id,
        partyType: "supplier",
        partyId: supplierId,
        partyName: supplier.name,
        amount: body.amount,
        direction: "debit",
        note: body.reference ?? "Supplier payment",
        createdByUserId: paidByUserId,
      });

      return inserted;
    });

    return res.status(201).json(fmtPayment(payment));
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues });
    return res.status(500).json({ error: "Failed to record supplier payment" });
  }
});

// GET /api/suppliers/:id/payments
router.get("/:id/payments", async (req, res): Promise<any> => {
  try {
    const supplierId = parseInt(req.params.id);
    const rows = await db
      .select()
      .from(supplierPaymentsTable)
      .where(and(eq(supplierPaymentsTable.supplierId, supplierId), eq(supplierPaymentsTable.isVoided, false)))
      .orderBy(desc(supplierPaymentsTable.paymentDate));
    return res.json(rows.map(fmtPayment));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch supplier payments" });
  }
});

// GET /api/suppliers/:id/purchases — purchase history for this supplier
router.get("/:id/purchases", async (req, res): Promise<any> => {
  try {
    const supplierId = parseInt(req.params.id);
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const conditions = [eq(purchasesTable.supplierId, supplierId)];
    if (from) conditions.push(gte(purchasesTable.purchaseDate, new Date(from)));
    if (to) conditions.push(lte(purchasesTable.purchaseDate, new Date(to)));

    const rows = await db.select().from(purchasesTable).where(and(...conditions)).orderBy(desc(purchasesTable.purchaseDate));
    return res.json(rows.map((p) => ({
      ...p,
      subtotal: parseFloat(p.subtotal as string),
      total: parseFloat(p.total as string),
      amountPaid: parseFloat(p.amountPaid as string),
      items: (p.items as unknown[]) || [],
      purchaseDate: p.purchaseDate.toISOString(),
      createdAt: p.createdAt.toISOString(),
    })));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch supplier purchase history" });
  }
});

export default router;
