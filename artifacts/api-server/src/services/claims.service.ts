import { db } from "@workspace/db";
import { claimsTable, salesTable, productsTable, customersTable, suppliersTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { appendLedgerEntry, round2, recomputeCustomerLedgerRunningBalances } from "../lib/ledger.js";
import { appendSupplierLedgerEntry, recomputeSupplierLedgerRunningBalances } from "../lib/supplier-ledger.js";
import { appendGeneralLedgerEntry } from "../lib/general-ledger.js";
import { isDateInClosedPeriod, MonthClosedError } from "./months.service.js";

export class ClaimValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimValidationError";
  }
}

async function getClaimOr404(id: number) {
  const [claim] = await db.select().from(claimsTable).where(eq(claimsTable.id, id));
  if (!claim) throw new ClaimValidationError("Claim not found");
  return claim;
}

export async function listClaims(params: Record<string, any>) {
  const page = Number(params.page) || 1;
  const limit = Number(params.limit) || 20;
  const offset = (page - 1) * limit;
  const conditions: any[] = [];
  if (params.status) conditions.push(sql`status = ${params.status}`);
  if (params.customerId) conditions.push(sql`customer_id = ${Number(params.customerId)}`);
  if (params.supplierId) conditions.push(sql`supplier_id = ${Number(params.supplierId)}`);

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(claimsTable).where(conditions.length ? sql`${sql.join(conditions, " AND ")}` : undefined as any);
  const rows = await db.select().from(claimsTable).where(conditions.length ? sql`${sql.join(conditions, " AND ")}` : undefined as any).orderBy(desc(claimsTable.createdAt)).limit(limit).offset(offset);
  return { data: rows, total: Number(count), page, limit };
}

/**
 * Stage 1 — a damaged product is received back from a customer.
 * stock -1 per unit (it's no longer sellable), customer ledger credited
 * the same way a normal return would be (they aren't charged for it).
 */
export async function createClaim(body: any, actorUserId: number | null) {
  const quantity = body.quantity && body.quantity > 0 ? body.quantity : 1;
  const claimDate = body.date ? new Date(body.date) : new Date();
  if (await isDateInClosedPeriod(claimDate)) {
    throw new MonthClosedError(claimDate);
  }

  let sale: typeof salesTable.$inferSelect | null = null;
  if (body.saleId) {
    const [existing] = await db.select().from(salesTable).where(eq(salesTable.id, body.saleId));
    if (!existing) throw new ClaimValidationError("Original invoice not found");
    sale = existing;
  }

  const [product] = await db.select({ id: productsTable.id, name: productsTable.name, currentStock: productsTable.currentStock }).from(productsTable).where(eq(productsTable.id, body.productId));
  if (!product) throw new ClaimValidationError("Product not found");

  const customerId = body.customerId ?? sale?.customerId ?? null;
  const customerName = body.customerName ?? sale?.customerName ?? "Walk-in customer";
  const totalValue = round2(quantity * body.unitPrice);

  const claim = await db.transaction(async (tx) => {
    await tx.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} - ${quantity}` }).where(eq(productsTable.id, body.productId));

    if (customerId) {
      await appendLedgerEntry(tx, {
        customerId,
        type: "return",
        amount: -totalValue,
        saleId: sale?.id ?? null,
        description: `Claim received: ${quantity} x ${product.name}${sale ? ` (Invoice ${sale.invoiceNumber})` : ""}`,
        createdByUserId: actorUserId,
        entryDate: claimDate,
      });
      await recomputeCustomerLedgerRunningBalances(tx, customerId);

      const [customer] = await tx.select().from(customersTable).where(eq(customersTable.id, customerId));
      await appendGeneralLedgerEntry(tx, {
        date: claimDate,
        type: "adjustment",
        partyType: "customer",
        partyId: customerId,
        partyName: customer?.name ?? customerName,
        amount: totalValue,
        direction: "debit",
        note: `Claim received: ${quantity} x ${product.name}`,
        createdByUserId: actorUserId,
      });
    }

    const [inserted] = await tx.insert(claimsTable).values({
      saleId: sale?.id ?? null,
      invoiceNumber: sale?.invoiceNumber ?? null,
      customerId,
      customerName,
      productId: body.productId,
      productName: product.name,
      quantity,
      unitPrice: String(body.unitPrice),
      totalValue: String(totalValue),
      status: "with_us",
      reason: body.reason ?? null,
      notes: body.notes ?? null,
      receivedAt: claimDate,
      createdByUserId: actorUserId,
    }).returning();

    return inserted;
  });

  return claim;
}

/**
 * Stage 2 — the damaged unit is physically sent to the supplier for
 * resolution. Tracking-only: no stock or ledger movement.
 */
export async function sendClaimToSupplier(id: number, body: any, actorUserId: number | null) {
  const claim = await getClaimOr404(id);
  if (claim.status !== "with_us") {
    throw new ClaimValidationError(`Claim is already ${claim.status}, cannot send to supplier`);
  }

  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, body.supplierId));
  if (!supplier) throw new ClaimValidationError("Supplier not found");

  const [updated] = await db.update(claimsTable).set({
    supplierId: body.supplierId,
    supplierName: supplier.name,
    status: "sent_to_supplier",
    sentToSupplierAt: new Date(),
    notes: body.notes ?? claim.notes,
  }).where(eq(claimsTable.id, id)).returning();

  void actorUserId;
  return updated;
}

/**
 * Stage 3 — the supplier resolves the claim, either with a physical
 * replacement (stock +1, no financial effect) or a credit/refund
 * (supplier ledger -amount, no stock effect).
 */
export async function resolveClaim(id: number, body: any, actorUserId: number | null) {
  const claim = await getClaimOr404(id);
  if (claim.status !== "sent_to_supplier") {
    throw new ClaimValidationError(`Claim must be sent to supplier before it can be resolved (currently ${claim.status})`);
  }
  if (!claim.supplierId) {
    throw new ClaimValidationError("Claim has no supplier on record");
  }

  const resolveDate = body.date ? new Date(body.date) : new Date();
  if (await isDateInClosedPeriod(resolveDate)) {
    throw new MonthClosedError(resolveDate);
  }

  const nextStatus = body.resolutionType === "replacement" ? "resolved_replacement" : "resolved_credit";
  const totalValue = round2(parseFloat(claim.totalValue as string));

  const updated = await db.transaction(async (tx) => {
    if (body.resolutionType === "replacement") {
      // Physical swap: a fresh unit comes back into stock. No financial
      // impact on the supplier ledger — it's a like-for-like exchange.
      await tx.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} + ${claim.quantity}` }).where(eq(productsTable.id, claim.productId));
    } else {
      await appendSupplierLedgerEntry(tx, {
        supplierId: claim.supplierId!,
        type: "return",
        amount: -totalValue,
        description: `Claim credit: ${claim.quantity} x ${claim.productName}${claim.invoiceNumber ? ` (Invoice ${claim.invoiceNumber})` : ""}`,
        createdByUserId: actorUserId,
        entryDate: resolveDate,
      });
      await recomputeSupplierLedgerRunningBalances(tx, claim.supplierId!);

      await appendGeneralLedgerEntry(tx, {
        date: resolveDate,
        type: "adjustment",
        partyType: "supplier",
        partyId: claim.supplierId,
        partyName: claim.supplierName,
        amount: totalValue,
        direction: "credit",
        note: `Claim credit: ${claim.quantity} x ${claim.productName}`,
        createdByUserId: actorUserId,
      });
    }

    const [row] = await tx.update(claimsTable).set({
      status: nextStatus,
      resolutionType: body.resolutionType,
      resolvedAt: resolveDate,
      notes: body.notes ?? claim.notes,
    }).where(eq(claimsTable.id, id)).returning();

    return row;
  });

  return updated;
}

/**
 * Stage 4 — only reachable when the supplier sent a replacement. The
 * replacement unit is handed over to the customer: stock -1 again, and the
 * claim is finally closed out.
 */
export async function returnClaimToCustomer(id: number, body: any, actorUserId: number | null) {
  const claim = await getClaimOr404(id);
  if (claim.status !== "resolved_replacement") {
    throw new ClaimValidationError(`Claim must be resolved with a replacement before it can be returned to the customer (currently ${claim.status})`);
  }

  const returnDate = body.date ? new Date(body.date) : new Date();
  if (await isDateInClosedPeriod(returnDate)) {
    throw new MonthClosedError(returnDate);
  }

  const updated = await db.transaction(async (tx) => {
    await tx.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} - ${claim.quantity}` }).where(eq(productsTable.id, claim.productId));

    const [row] = await tx.update(claimsTable).set({
      status: "returned_to_customer",
      returnedToCustomerAt: returnDate,
      notes: body.notes ?? claim.notes,
    }).where(eq(claimsTable.id, id)).returning();

    return row;
  });

  void actorUserId;
  return updated;
}

export default { listClaims, createClaim, sendClaimToSupplier, resolveClaim, returnClaimToCustomer, ClaimValidationError };
