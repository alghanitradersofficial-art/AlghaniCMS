import { Router } from "express";
import { db } from "@workspace/db";
import { purchasesTable, productsTable } from "@workspace/db";
import { eq, ilike, and, sql } from "drizzle-orm";
import { CreatePurchaseBody, UpdatePurchaseBody } from "@workspace/api-zod";
import { z } from "zod";
import { appendSupplierLedgerEntry } from "../lib/supplier-ledger.js";
import { appendGeneralLedgerEntry } from "../lib/general-ledger.js";
import { getUserIdFromRequest } from "../lib/auth-context.js";

const router = Router();

// Optional backdating field, layered on top of the generated CreatePurchaseBody
// (not yet part of the OpenAPI spec) so old purchase records can be entered
// with a real historical date instead of always defaulting to "now".
const PurchaseDateExtension = z.object({ purchaseDate: z.string().optional() });

function formatPurchase(p: typeof purchasesTable.$inferSelect) {
  return {
    ...p,
    subtotal: parseFloat(p.subtotal as string),
    total: parseFloat(p.total as string),
    amountPaid: parseFloat((p.amountPaid ?? "0") as string),
    items: (p.items as unknown[]) || [],
    purchaseDate: (p.purchaseDate ?? p.createdAt).toISOString(),
    createdAt: p.createdAt.toISOString(),
  };
}

async function adjustPurchaseStock(purchase: typeof purchasesTable.$inferSelect, delta: 1 | -1) {
  const items = (purchase.items as unknown[]) || [];
  for (const item of items as Array<{ productId: number; quantity: number }>) {
    await db.update(productsTable).set({
      currentStock: sql`${productsTable.currentStock} + ${item.quantity * delta}`,
    }).where(eq(productsTable.id, item.productId));
  }
}

router.get("/", async (req, res) => {
  try {
    const search = req.query.search as string;
    const status = req.query.status as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (search) conditions.push(ilike(purchasesTable.supplierName, `%${search}%`));
    if (status) conditions.push(eq(purchasesTable.status, status));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(purchasesTable).where(whereClause);
    const total = Number(count);

    const rows = await db.select().from(purchasesTable).where(whereClause)
      .orderBy(sql`${purchasesTable.createdAt} DESC`).limit(limit).offset(offset);

    return res.json({ data: rows.map(formatPurchase), total, page, limit });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch purchases" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = CreatePurchaseBody.parse(req.body);
    const { purchaseDate: purchaseDateStr } = PurchaseDateExtension.parse(req.body);
    const purchaseDate = purchaseDateStr ? new Date(purchaseDateStr) : new Date();
    const createdByUserId = getUserIdFromRequest(req);

    const items = body.items.map((item: { productId: number; quantity: number; unitCost: number }) => ({
      productId: item.productId,
      productName: "",
      quantity: item.quantity,
      unitCost: item.unitCost,
      total: item.quantity * item.unitCost,
    }));

    for (const item of items) {
      const [product] = await db.select({ name: productsTable.name }).from(productsTable).where(eq(productsTable.id, item.productId));
      if (product) item.productName = product.name;
    }

    // Add stock if received
    if (!body.status || body.status === "received") {
      for (const item of items) {
        await db.update(productsTable).set({
          currentStock: sql`${productsTable.currentStock} + ${item.quantity}`,
        }).where(eq(productsTable.id, item.productId));
      }
    }

    const subtotal = items.reduce((sum, i) => sum + i.total, 0);
    const poNumber = `PO-${Date.now()}`;

    const purchase = await db.transaction(async (tx) => {
      const [inserted] = await tx.insert(purchasesTable).values({
        poNumber,
        supplierId: body.supplierId ?? null,
        supplierName: body.supplierName,
        status: body.status || "received",
        subtotal: String(subtotal),
        total: String(subtotal),
        notes: body.notes ?? null,
        items: items,
        purchaseDate,
      }).returning();

      // Only suppliers that exist as a real supplier record get a ledger
      // entry — ad-hoc supplierName-only purchases (no supplierId) don't
      // have a khata to post to.
      if (body.supplierId) {
        const ledgerEntry = await appendSupplierLedgerEntry(tx, {
          supplierId: body.supplierId,
          type: "purchase",
          amount: subtotal,
          purchaseId: inserted.id,
          description: `Purchase — ${poNumber}`,
          createdByUserId,
          entryDate: purchaseDate,
        });

        await appendGeneralLedgerEntry(tx, {
          date: purchaseDate,
          type: "purchase",
          referenceId: inserted.id,
          partyType: "supplier",
          partyId: body.supplierId,
          partyName: body.supplierName,
          amount: subtotal,
          direction: "debit",
          note: `PO ${poNumber}`,
          createdByUserId,
        });
        void ledgerEntry;
      }

      return inserted;
    });

    return res.status(201).json(formatPurchase(purchase));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to create purchase" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [purchase] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, id));
    if (!purchase) return res.status(404).json({ error: "Purchase not found" });
    return res.json(formatPurchase(purchase));
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch purchase" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = UpdatePurchaseBody.parse(req.body);
    const [existingPurchase] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, id));
    if (!existingPurchase) return res.status(404).json({ error: "Purchase not found" });

    const updateData: Record<string, unknown> = {};
    if (body.status !== undefined) updateData.status = body.status;
    if (body.notes !== undefined) updateData.notes = body.notes;

    if (body.status !== undefined && body.status !== existingPurchase.status) {
      if (existingPurchase.status === "received" && body.status !== "received") {
        await adjustPurchaseStock(existingPurchase, -1);
      } else if (existingPurchase.status !== "received" && body.status === "received") {
        await adjustPurchaseStock(existingPurchase, 1);
      }
    }

    const [purchase] = await db.update(purchasesTable).set(updateData).where(eq(purchasesTable.id, id)).returning();
    return res.json(formatPurchase(purchase));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to update purchase" });
  }
});

export default router;
