import { db } from "@workspace/db";
import { salesReturnsTable, salesTable, productsTable, customersTable } from "@workspace/db";
import { eq, sql, inArray, desc } from "drizzle-orm";
import { appendLedgerEntry, round2, recomputeCustomerLedgerRunningBalances } from "../lib/ledger.js";
import { appendGeneralLedgerEntry } from "../lib/general-ledger.js";
import { isDateInClosedPeriod, MonthClosedError } from "./months.service.js";

export class SaleReturnValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaleReturnValidationError";
  }
}

type ReturnItemInput = { productId: number; quantity: number; unitPrice: number };

export async function listSalesReturns(params: Record<string, any>) {
  const page = Number(params.page) || 1;
  const limit = Number(params.limit) || 20;
  const offset = (page - 1) * limit;
  const conditions: any[] = [];
  if (params.saleId) conditions.push(sql`sale_id = ${Number(params.saleId)}`);
  if (params.customerId) conditions.push(sql`customer_id = ${Number(params.customerId)}`);

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(salesReturnsTable).where(conditions.length ? sql`${sql.join(conditions, " AND ")}` : undefined as any);
  const rows = await db.select().from(salesReturnsTable).where(conditions.length ? sql`${sql.join(conditions, " AND ")}` : undefined as any).orderBy(desc(salesReturnsTable.createdAt)).limit(limit).offset(offset);
  return { data: rows, total: Number(count), page, limit };
}

/**
 * Creates a sale return. Handles both:
 *  - invoice-linked: body.saleId set, items are matched against (and
 *    deducted from) that invoice's own line items
 *  - stand-alone: no saleId, customer + items chosen directly
 *
 * Always, atomically:
 *  - restores stock for every returned item
 *  - if a customerId is present, appends a "return" customer-ledger entry
 *    for -total (reduces what the customer owes)
 *  - if invoice-linked, shrinks the original invoice's items/subtotal/total
 */
export async function createSalesReturn(body: any, actorUserId: number | null) {
  if (!body.items || body.items.length === 0) {
    throw new SaleReturnValidationError("At least one item is required");
  }

  const returnDate = body.returnDate ? new Date(body.returnDate) : new Date();
  if (await isDateInClosedPeriod(returnDate)) {
    throw new MonthClosedError(returnDate);
  }

  let sale: typeof salesTable.$inferSelect | null = null;
  if (body.saleId) {
    const [existing] = await db.select().from(salesTable).where(eq(salesTable.id, body.saleId));
    if (!existing) throw new SaleReturnValidationError("Original invoice not found");
    sale = existing;
  }

  const customerId = body.customerId ?? sale?.customerId ?? null;
  const customerName = body.customerName ?? sale?.customerName ?? "Walk-in customer";

  const productIds: number[] = Array.from(new Set(body.items.map((i: any) => Number(i.productId))));
  const products = (productIds.length
    ? await db.select({ id: productsTable.id, name: productsTable.name, sku: productsTable.sku }).from(productsTable).where(inArray(productsTable.id, productIds))
    : []) as Array<{ id: number; name: string; sku: string }>;
  const productById = new Map<number, { id: number; name: string; sku: string }>(products.map((p) => [p.id, p]));

  // When linked to an invoice, every returned quantity must not exceed what
  // remains on that invoice (accounting for any prior partial returns).
  let saleItems: Array<any> = sale ? ((sale.items as Array<any>) || []) : [];
  if (sale) {
    for (const reqItem of body.items) {
      const line = saleItems.find((it) => Number(it.productId) === Number(reqItem.productId));
      if (!line || Number(line.quantity) < Number(reqItem.quantity)) {
        const name = productById.get(reqItem.productId)?.name ?? `product #${reqItem.productId}`;
        throw new SaleReturnValidationError(`Cannot return ${reqItem.quantity} of ${name}: only ${line?.quantity ?? 0} remain on invoice ${sale.invoiceNumber}`);
      }
    }
  }

  const items = body.items.map((item) => {
    const product = productById.get(item.productId);
    return {
      productId: item.productId,
      productName: product?.name ?? "",
      sku: product?.sku ?? "",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: round2(item.quantity * item.unitPrice),
    };
  });
  const subtotal = round2(items.reduce((s, i) => s + i.total, 0));
  const total = subtotal;

  const result = await db.transaction(async (tx) => {
    // 1. Stock comes back into inventory.
    for (const item of items) {
      await tx.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} + ${item.quantity}` }).where(eq(productsTable.id, item.productId));
    }

    // 2. Shrink the original invoice, if linked.
    if (sale) {
      const nextItems = saleItems
        .map((it) => {
          const returned = body.items.find((r) => Number(r.productId) === Number(it.productId));
          if (!returned) return it;
          return { ...it, quantity: Number(it.quantity) - Number(returned.quantity), total: round2((Number(it.quantity) - Number(returned.quantity)) * Number(it.unitPrice)) };
        })
        .filter((it) => Number(it.quantity) > 0);

      const nextSubtotal = round2(parseFloat(sale.subtotal as string) - subtotal);
      const nextTotal = round2(parseFloat(sale.total as string) - total);
      await tx.update(salesTable).set({
        items: nextItems,
        subtotal: String(Math.max(0, nextSubtotal)),
        total: String(Math.max(0, nextTotal)),
      }).where(eq(salesTable.id, sale.id));
    }

    // 3. Customer ledger: credit the customer back (reduces what they owe).
    if (customerId) {
      await appendLedgerEntry(tx, {
        customerId,
        type: "return",
        amount: -total,
        saleId: sale?.id ?? null,
        description: sale ? `Sale return against Invoice ${sale.invoiceNumber}` : `Sale return (${body.reason || "no reason given"})`,
        createdByUserId: actorUserId,
        entryDate: returnDate,
      });
      await recomputeCustomerLedgerRunningBalances(tx, customerId);

      const [customer] = await tx.select().from(customersTable).where(eq(customersTable.id, customerId));
      await appendGeneralLedgerEntry(tx, {
        date: returnDate,
        type: "adjustment",
        referenceId: sale?.id ?? null,
        partyType: "customer",
        partyId: customerId,
        partyName: customer?.name ?? customerName,
        amount: total,
        direction: "debit",
        note: `Sale return${sale ? ` against Invoice ${sale.invoiceNumber}` : ""}`,
        createdByUserId: actorUserId,
      });
    }

    const [inserted] = await tx.insert(salesReturnsTable).values({
      saleId: sale?.id ?? null,
      invoiceNumber: sale?.invoiceNumber ?? null,
      customerId,
      customerName,
      items,
      subtotal: String(subtotal),
      total: String(total),
      reason: body.reason ?? null,
      notes: body.notes ?? null,
      returnDate,
      createdByUserId: actorUserId,
    }).returning();

    return inserted;
  });

  return result;
}

export default { listSalesReturns, createSalesReturn, SaleReturnValidationError };
