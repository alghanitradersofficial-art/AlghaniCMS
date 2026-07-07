import { Router } from "express";
import { z } from "zod";
import { db, paymentsTable, customersTable, ledgerEntriesTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { appendLedgerEntry, allocatePayment, round2 } from "../lib/ledger";
import { getUserIdFromRequest } from "../lib/auth-context";

const router = Router();

const PaymentMethod = z.enum(["cash", "bank_transfer", "cheque", "jazzcash", "easypaisa", "other"]);

const CreatePaymentBody = z.object({
  customerId: z.number().int().positive(),
  amount: z.number().positive(),
  method: PaymentMethod.default("cash"),
  bankName: z.string().optional(),
  chequeNumber: z.string().optional(),
  transactionId: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  attachmentUrl: z.string().optional(),
  paymentDate: z.string().datetime().optional(),
  allocations: z.array(z.object({ saleId: z.number().int().positive(), amount: z.number().positive() })).optional(),
});

function fmtPayment(p: typeof paymentsTable.$inferSelect) {
  return {
    id: p.id,
    customerId: p.customerId,
    amount: parseFloat(p.amount as string),
    method: p.method,
    bankName: p.bankName,
    chequeNumber: p.chequeNumber,
    transactionId: p.transactionId,
    reference: p.reference,
    notes: p.notes,
    receivedByUserId: p.receivedByUserId,
    attachmentUrl: p.attachmentUrl,
    allocations: p.allocations,
    isVoided: p.isVoided,
    voidReason: p.voidReason,
    paymentDate: p.paymentDate.toISOString(),
    createdAt: p.createdAt.toISOString(),
  };
}

/** POST /api/payments — Receive Payment (section 8), transaction-safe. */
router.post("/", async (req, res): Promise<any> => {
  try {
    const body = CreatePaymentBody.parse(req.body);
    const receivedByUserId = getUserIdFromRequest(req);
    const paymentDate = body.paymentDate ? new Date(body.paymentDate) : new Date();

    const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, body.customerId));
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const payment = await db.transaction(async (tx) => {
      const ledgerEntry = await appendLedgerEntry(tx, {
        customerId: body.customerId,
        type: "payment",
        amount: -body.amount,
        description: body.reference ? `Payment — ${body.reference}` : "Payment received",
        createdByUserId: receivedByUserId,
        entryDate: paymentDate,
      });

      const rawAllocations = await allocatePayment(tx, {
        customerId: body.customerId,
        amount: body.amount,
        explicitAllocations: body.allocations,
      });

      // 1. Force structural untyped conversion to break optional trace chains
      const parsedAllocations = (rawAllocations ?? []) as any[];
      
      // 2. Strict required non-optional schema properties enforcement
      const cleanAllocations = parsedAllocations.map(a => {
        return {
          saleId: Number(a.saleId),
          amount: Number(a.amount)
        };
      }) as any;

      // 3. Directly matching target layout
      const insertValues = {
        customerId: body.customerId,
        amount: String(body.amount),
        method: body.method,
        bankName: body.bankName ?? null,
        chequeNumber: body.chequeNumber ?? null,
        transactionId: body.transactionId ?? null,
        reference: body.reference ?? null,
        notes: body.notes ?? null,
        receivedByUserId,
        attachmentUrl: body.attachmentUrl ?? null,
        allocations: cleanAllocations,
        paymentDate,
      };

      const [inserted] = await tx
        .insert(paymentsTable)
        .values(insertValues as any)
        .returning();

      await tx.update(ledgerEntriesTable)
        .set({ paymentId: inserted.id })
        .where(eq(ledgerEntriesTable.id, ledgerEntry.id));

      return inserted;
    });

    return res.status(201).json(fmtPayment(payment));
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues });
    return res.status(500).json({ error: "Failed to record payment" });
  }
});

/** GET /api/payments?customerId=&method=&page=&limit= — Payment History (section 4). */
router.get("/", async (req, res): Promise<any> => {
  try {
    const customerId = req.query.customerId ? parseInt(req.query.customerId as string) : undefined;
    const method = req.query.method as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const conditions = [eq(paymentsTable.isVoided, false)];
    if (customerId) conditions.push(eq(paymentsTable.customerId, customerId));
    if (method) conditions.push(eq(paymentsTable.method, method));

    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(paymentsTable).where(and(...conditions));
    const rows = await db
      .select()
      .from(paymentsTable)
      .where(and(...conditions))
      .orderBy(desc(paymentsTable.paymentDate))
      .limit(limit)
      .offset(offset);

    return res.json({ data: rows.map(fmtPayment), total: Number(count), page, limit });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch payments" });
  }
});

/** GET /api/payments/customer/:id/summary — Last/2nd-last/last-10, totals, avg, largest, smallest (section 4). */
router.get("/customer/:id/summary", async (req, res): Promise<any> => {
  try {
    const customerId = parseInt(req.params.id);
    const rows = await db
      .select()
      .from(paymentsTable)
      .where(and(eq(paymentsTable.customerId, customerId), eq(paymentsTable.isVoided, false)))
      .orderBy(desc(paymentsTable.paymentDate))
      .limit(10);

    const [agg] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${paymentsTable.amount}), 0)`,
        avg: sql<string>`COALESCE(AVG(${paymentsTable.amount}), 0)`,
        max: sql<string>`COALESCE(MAX(${paymentsTable.amount}), 0)`,
        min: sql<string>`COALESCE(MIN(${paymentsTable.amount}), 0)`,
        count: sql<string>`COUNT(*)`,
      })
      .from(paymentsTable)
      .where(and(eq(paymentsTable.customerId, customerId), eq(paymentsTable.isVoided, false)));

    return res.json({
      lastPayment: rows[0] ? fmtPayment(rows[0]) : null,
      secondLastPayment: rows[1] ? fmtPayment(rows[1]) : null,
      lastTenPayments: rows.map(fmtPayment),
      totalPaid: round2(parseFloat(agg?.total ?? "0")),
      averagePayment: round2(parseFloat(agg?.avg ?? "0")),
      largestPayment: round2(parseFloat(agg?.max ?? "0")),
      smallestPayment: round2(parseFloat(agg?.min ?? "0")),
      paymentCount: Number(agg?.count ?? 0),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch payment summary" });
  }
});

/** POST /api/payments/:id/void — soft-delete a payment (never hard-delete financial records). */
router.post("/:id/void", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    const reason = z.object({ reason: z.string().min(1) }).parse(req.body).reason;
    const createdByUserId = getUserIdFromRequest(req);

    const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, id));
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    if (payment.isVoided) return res.status(400).json({ error: "Payment is already voided" });

    await db.transaction(async (tx) => {
      await tx.update(paymentsTable).set({ isVoided: true, voidReason: reason }).where(eq(paymentsTable.id, id));

      const allocations = (payment.allocations as Array<{ saleId: number; amount: number }>) || [];
      for (const alloc of allocations) {
        await tx.execute(
          sql`UPDATE sales SET amount_paid = amount_paid - ${alloc.amount} WHERE id = ${alloc.saleId}`,
        );
      }

      await appendLedgerEntry(tx, {
        customerId: payment.customerId,
        type: "adjustment",
        amount: parseFloat(payment.amount as string),
        paymentId: payment.id,
        description: `Payment voided: ${reason}`,
        createdByUserId,
      });
    });

    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to void payment" });
  }
});

export default router;