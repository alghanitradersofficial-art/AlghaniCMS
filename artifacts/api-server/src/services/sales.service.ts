import { db } from "@workspace/db";
import { salesTable, productsTable, priceHistoryTable, ledgerEntriesTable, paymentsTable, customersTable } from "@workspace/db";
import { eq, sql, inArray } from "drizzle-orm";
import { appendLedgerEntry, round2, recomputeCustomerLedgerRunningBalances } from "../lib/ledger.js";
import { appendGeneralLedgerEntry } from "../lib/general-ledger.js";
import { calculateDailyProfitSummary } from "../lib/inventory-accounting.js";
import { isDateInClosedPeriod, MonthClosedError } from "./months.service.js";

export class InsufficientStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientStockError";
  }
}

function ensureStockAvailability(
  items: Array<any>,
  productById: Map<
    number,
    { currentStock: number; name?: string | null; sku?: string | null }
  >,
) {
  const requestedQuantities = new Map<number, number>();
  for (const item of items) {
    const productId = Number(item.productId);
    const quantity = Number(item.quantity) || 0;
    requestedQuantities.set(productId, (requestedQuantities.get(productId) ?? 0) + quantity);
  }

  const insufficientProducts: string[] = [];
  for (const [productId, requestedQty] of requestedQuantities.entries()) {
    const product = productById.get(productId);
    if (!product) {
      insufficientProducts.push(`product #${productId}`);
      continue;
    }
    if (product.currentStock < requestedQty) {
      const productName = product.name ?? `product #${productId}`;
      const sku = product.sku ? ` (${product.sku})` : "";
      insufficientProducts.push(`${productName}${sku}`);
    }
  }

  if (insufficientProducts.length > 0) {
    throw new InsufficientStockError(`Insufficient stock for product(s): ${insufficientProducts.join(", ")}`);
  }
}

export async function listSales(params: Record<string, any>) {
  const search = params.search as string | undefined;
  const status = params.status as string | undefined;
  // Optional invoice date range (inclusive), used by the Sales page's
  // Daily / Weekly / Monthly / Custom views. dateTo is treated as
  // end-of-day so a same-day range (dateFrom === dateTo) still matches.
  const dateFrom = params.dateFrom as string | undefined;
  const dateTo = params.dateTo as string | undefined;
  const page = Number(params.page) || 1;
  const limit = Number(params.limit) || 20;
  const offset = (page - 1) * limit;

  const conditions: any[] = [];
  if (search) {
    // Universal search — matches customer name, invoice number, or any
    // product name inside the sale's line items.
    conditions.push(sql`(
      customer_name ILIKE ${`%${search}%`}
      OR invoice_number ILIKE ${`%${search}%`}
      OR items::text ILIKE ${`%${search}%`}
    )`);
  }
  if (status) conditions.push(sql`status = ${status}`);
  if (dateFrom) conditions.push(sql`COALESCE(sale_date, created_at) >= ${new Date(dateFrom)}`);
  if (dateTo) {
    const endOfDay = new Date(dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    conditions.push(sql`COALESCE(sale_date, created_at) <= ${endOfDay}`);
  }

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(salesTable).where(conditions.length ? sql`${sql.join(conditions, sql` AND `)}` : undefined as any);
  const rows = await db.select().from(salesTable).where(conditions.length ? sql`${sql.join(conditions, sql` AND `)}` : undefined as any).orderBy(sql`${salesTable.createdAt} DESC`).limit(limit).offset(offset);
  return { data: rows.map((r) => r), total: Number(count), page, limit };
}

// Lightweight aggregate for the Sales page's Daily/Weekly/Monthly/Custom stat
// strip — total orders + total sale amount + total cash received for the
// filtered set, computed in SQL so it isn't limited to just the current page.
export async function getSalesSummary(params: Record<string, any>) {
  const search = params.search as string | undefined;
  const status = params.status as string | undefined;
  const dateFrom = params.dateFrom as string | undefined;
  const dateTo = params.dateTo as string | undefined;

  const conditions: any[] = [];
  if (search) {
    conditions.push(sql`(
      customer_name ILIKE ${`%${search}%`}
      OR invoice_number ILIKE ${`%${search}%`}
      OR items::text ILIKE ${`%${search}%`}
    )`);
  }
  if (status) conditions.push(sql`status = ${status}`);
  if (dateFrom) conditions.push(sql`COALESCE(sale_date, created_at) >= ${new Date(dateFrom)}`);
  if (dateTo) {
    const endOfDay = new Date(dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    conditions.push(sql`COALESCE(sale_date, created_at) <= ${endOfDay}`);
  }

  const [row] = await db
    .select({
      count: sql<number>`count(*)`,
      totalAmount: sql<string>`COALESCE(SUM(${salesTable.total}), 0)`,
      totalReceived: sql<string>`COALESCE(SUM(${salesTable.amountPaid}), 0)`,
    })
    .from(salesTable)
    .where(conditions.length ? sql`${sql.join(conditions, sql` AND `)}` : undefined as any);

  return {
    count: Number(row?.count ?? 0),
    totalAmount: round2(parseFloat(row?.totalAmount ?? "0")),
    totalReceived: round2(parseFloat(row?.totalReceived ?? "0")),
  };
}

export async function createSale(body: any, actorUserId: number | null) {
  // prepare products and items
  const productIds = Array.from(new Set(body.items.map((i: any) => Number(i.productId)))) as number[];
  const products = (productIds.length
    ? await db.select({ id: productsTable.id, name: productsTable.name, sku: productsTable.sku, costPrice: productsTable.costPrice, currentStock: productsTable.currentStock }).from(productsTable).where(inArray(productsTable.id, productIds))
    : []) as Array<{ id: number; name: string; sku: string; costPrice: string | number; currentStock: number }>;
  const productById = new Map(products.map((p) => [p.id, p]));
  const status = body.status || "completed";
  if (status === "completed") {
    ensureStockAvailability(body.items, productById);
  }

  const subtotalRaw = body.items.reduce((sum: number, i: any) => sum + i.quantity * i.unitPrice, 0);
  const discount = body.discount || 0;
  const items = body.items.map((item: any) => {
    const product = productById.get(item.productId);
    const lineSubtotal = item.quantity * item.unitPrice;
    const lineDiscount = subtotalRaw > 0 ? round2(discount * (lineSubtotal / subtotalRaw)) : 0;
    const lineFinal = round2(lineSubtotal - lineDiscount);
    return {
      productId: item.productId,
      productName: product?.name ?? "",
      sku: product?.sku ?? "",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: round2(lineSubtotal),
      lineDiscount,
      finalPrice: lineFinal,
      costPrice: product ? parseFloat(product.costPrice as string) : 0,
    };
  });

  const subtotal = round2(subtotalRaw);
  const total = round2(subtotal - discount);
  const invoiceNumber = `INV-${Date.now()}`;
  const invoiceDate = body.saleDate ? new Date(body.saleDate) : new Date();

  if (await isDateInClosedPeriod(invoiceDate)) {
    throw new MonthClosedError(invoiceDate);
  }

  // Cash actually collected right now (at the counter), as opposed to the
  // invoice total. Walk-in sales (no customerId — nobody to owe us later)
  // are always treated as fully paid in cash. Sales against a khata
  // customer default to zero received (pure udhaar/credit) unless the
  // caller explicitly says otherwise, and can be any amount from 0 up to
  // the invoice total (partial payment at time of sale).
  const receivedNow = body.customerId
    ? round2(Math.max(0, Math.min(Number(body.amountReceived) || 0, total)))
    : total;
  const paymentMethod = body.paymentMethod || "cash";

  const sale = await db.transaction(async (tx) => {
    if (status === "completed") {
      for (const item of items) {
        await tx.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} - ${item.quantity}` }).where(eq(productsTable.id, item.productId));
      }
    }

    const [insertedSale] = await tx.insert(salesTable).values({
      invoiceNumber,
      customerId: body.customerId ?? null,
      customerName: body.customerName,
      status,
      subtotal: String(subtotal),
      discount: String(discount),
      total: String(total),
      // Cash collected at the counter is recorded immediately; the rest
      // stays outstanding on the customer's khata until a later payment.
      amountPaid: String(body.customerId && status === "completed" ? receivedNow : 0),
      notes: body.notes ?? null,
      items: items.map(({ productId, productName, quantity, unitPrice, total: t }) => ({ productId, productName, quantity, unitPrice, total: t })),
      saleDate: invoiceDate,
    }).returning();

    if (body.customerId && status === "completed") {
      for (const item of items) {
        const profitAmount = round2(item.finalPrice - item.costPrice * item.quantity);
        const profitPercentage = item.finalPrice > 0 ? round2((profitAmount / item.finalPrice) * 100) : 0;
        await tx.insert(priceHistoryTable).values({
          customerId: body.customerId,
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          saleId: insertedSale.id,
          invoiceNumber,
          invoiceDate,
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice),
          discount: String(item.lineDiscount),
          finalPrice: String(item.finalPrice),
          costPrice: String(item.costPrice),
          profitAmount: String(profitAmount),
          profitPercentage: String(profitPercentage),
          createdByUserId: actorUserId,
        });
      }

      // Full invoice amount always goes on the customer's khata (accounts
      // receivable) regardless of how much cash came in right now — this
      // is what "sale on credit" means: the sale is recorded in full, the
      // cash follows separately (now, later, or in installments).
      await appendLedgerEntry(tx, {
        customerId: body.customerId,
        type: "sale",
        amount: total,
        saleId: insertedSale.id,
        description: `Invoice ${invoiceNumber}`,
        createdByUserId: actorUserId,
        entryDate: invoiceDate,
      });

      let paymentIdForLedger: number | null = null;
      if (receivedNow > 0) {
        // Cash received at the counter is its own payment record — same
        // shape as a payment recorded later via /api/payments — so it
        // shows up consistently in payment history/allocations.
        const [customer] = await tx.select().from(customersTable).where(eq(customersTable.id, body.customerId));
        const [insertedPayment] = await tx.insert(paymentsTable).values({
          customerId: body.customerId,
          amount: String(receivedNow),
          method: paymentMethod,
          reference: `Invoice ${invoiceNumber}`,
          notes: "Received at time of sale",
          receivedByUserId: actorUserId,
          allocations: [{ saleId: insertedSale.id, amount: receivedNow }],
          paymentDate: invoiceDate,
        }).returning();
        paymentIdForLedger = insertedPayment.id;

        await appendLedgerEntry(tx, {
          customerId: body.customerId,
          type: "payment",
          amount: -receivedNow,
          saleId: insertedSale.id,
          paymentId: insertedPayment.id,
          description: `Payment received with Invoice ${invoiceNumber}`,
          createdByUserId: actorUserId,
          entryDate: invoiceDate,
        });

        await appendGeneralLedgerEntry(tx, {
          date: invoiceDate,
          type: "customer_payment",
          referenceId: insertedPayment.id,
          partyType: "customer",
          partyId: body.customerId,
          partyName: customer?.name ?? body.customerName,
          amount: receivedNow,
          direction: "credit",
          note: `Payment with Invoice ${invoiceNumber}`,
          createdByUserId: actorUserId,
        });
      }
      void paymentIdForLedger;

      // invoiceDate can be backdated relative to other ledger entries, so
      // re-chain every entry's running balance in chronological order
      // rather than trusting insertion order.
      await recomputeCustomerLedgerRunningBalances(tx, body.customerId);
    } else if (status === "completed") {
      // Walk-in sale, no customer on record — always immediate cash, goes
      // straight to the cash-in-hand ledger.
      const profitSummary = calculateDailyProfitSummary({ sales: total, cogs: items.reduce((sum, item) => sum + item.costPrice * item.quantity, 0), expenses: 0 });
      await appendGeneralLedgerEntry(tx, {
        date: invoiceDate,
        type: "sale",
        referenceId: insertedSale.id,
        partyType: "none",
        partyId: null,
        partyName: body.customerName,
        amount: total,
        direction: "credit",
        note: `Invoice ${invoiceNumber} | grossProfit=${profitSummary.grossProfit}`,
        createdByUserId: actorUserId,
      });
    }

    return insertedSale;
  });

  return sale;
}

export async function updateSale(id: number, body: any, actorUserId: number | null) {
  const [existingSale] = await db.select().from(salesTable).where(eq(salesTable.id, id));
  if (!existingSale) throw new Error("Sale not found");

  if (existingSale.saleDate && await isDateInClosedPeriod(new Date(existingSale.saleDate))) {
    throw new MonthClosedError(new Date(existingSale.saleDate));
  }

  const updateData: Record<string, unknown> = {};
  if (body.status !== undefined) updateData.status = body.status;
  if (body.discount !== undefined) updateData.discount = String(body.discount);
  if (body.notes !== undefined) updateData.notes = body.notes;

  if (
    body.status !== undefined &&
    body.status !== existingSale.status &&
    existingSale.status === "completed" &&
    body.status !== "completed" &&
    round2(parseFloat((existingSale.amountPaid as string) ?? "0")) > 0
  ) {
    throw new Error(
      `Cannot void Invoice ${existingSale.invoiceNumber}: it has ${parseFloat(existingSale.amountPaid as string)} already received against it. Void the linked payment(s) first so cash-in-hand stays accurate.`,
    );
  }

  const sale = await db.transaction(async (tx) => {
    if (body.status !== undefined && body.status !== existingSale.status) {
      if (existingSale.status === "completed" && body.status !== "completed") {
        // restore stock
        const items = existingSale.items as Array<any>;
        for (const item of items) {
          await tx.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} + ${item.quantity}` }).where(eq(productsTable.id, item.productId));
        }
        if (existingSale.customerId) {
          await appendLedgerEntry(tx, {
            customerId: existingSale.customerId,
            type: "adjustment",
            amount: -parseFloat(existingSale.total as string),
            saleId: existingSale.id,
            description: `Invoice ${existingSale.invoiceNumber} status changed from completed to ${body.status}`,
            createdByUserId: actorUserId,
          });
          await recomputeCustomerLedgerRunningBalances(tx, existingSale.customerId);
        }
      } else if (existingSale.status !== "completed" && body.status === "completed") {
        const items = existingSale.items as Array<any>;
        const productIds = Array.from(new Set(items.map((item) => Number(item.productId))));
        const products = (productIds.length
          ? await tx.select({ id: productsTable.id, currentStock: productsTable.currentStock }).from(productsTable).where(inArray(productsTable.id, productIds))
          : []) as Array<{ id: number; currentStock: number }>;
        const productStockById = new Map(products.map((p) => [p.id, p]));
        ensureStockAvailability(items, productStockById as unknown as Map<number, { id: number; name: string; sku: string; costPrice: string | number; currentStock: number }>);
        for (const item of items) {
          await tx.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} - ${item.quantity}` }).where(eq(productsTable.id, item.productId));
        }
        if (existingSale.customerId) {
          await appendLedgerEntry(tx, {
            customerId: existingSale.customerId,
            type: "adjustment",
            amount: parseFloat(existingSale.total as string),
            saleId: existingSale.id,
            description: `Invoice ${existingSale.invoiceNumber} status changed to completed`,
            createdByUserId: actorUserId,
          });
          await recomputeCustomerLedgerRunningBalances(tx, existingSale.customerId);
        }
      }
    }

    const [updated] = await tx.update(salesTable).set(updateData).where(eq(salesTable.id, id)).returning();
    return updated;
  });

  return sale;
}

export async function deleteSale(id: number, actorUserId: number | null) {
  const [existingSale] = await db.select().from(salesTable).where(eq(salesTable.id, id));
  if (!existingSale) throw new Error("Sale not found");

  if (existingSale.saleDate && await isDateInClosedPeriod(new Date(existingSale.saleDate))) {
    throw new MonthClosedError(new Date(existingSale.saleDate));
  }

  await db.transaction(async (tx) => {
    try {
      await tx.delete(priceHistoryTable).where(eq(priceHistoryTable.saleId, id));
    } catch (priceHistoryErr) {
      console.warn("delete sale price history cleanup failed", priceHistoryErr);
    }

    try {
      await tx.update(ledgerEntriesTable).set({ saleId: null }).where(eq(ledgerEntriesTable.saleId, id));
    } catch (ledgerCleanupErr) {
      console.warn("delete sale ledger cleanup failed", ledgerCleanupErr);
    }

    try {
      const items = (existingSale.items as Array<any>) || [];
      for (const item of items) {
        await tx.update(productsTable).set({ currentStock: sql`${productsTable.currentStock} + ${item.quantity}` }).where(eq(productsTable.id, item.productId));
      }
    } catch (stockErr) {
      console.warn("delete sale stock restore failed", stockErr);
    }

    try {
      await tx.delete(salesTable).where(eq(salesTable.id, id));
    } catch (saleDeleteErr) {
      console.error("delete sale row failed", saleDeleteErr);
      throw saleDeleteErr;
    }
  });
}

export default { listSales, getSalesSummary, createSale, updateSale, deleteSale, InsufficientStockError };
