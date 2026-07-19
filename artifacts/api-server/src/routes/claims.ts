import { Router } from "express";
import { z } from "zod";
import claimsService from "../services/claims.service.js";
import { MonthClosedError } from "../services/months.service.js";
import { getUserIdFromRequest } from "../lib/auth-context.js";
import { clearCachePrefix } from "../lib/dashboard-cache.js";

const router = Router();

function formatClaim(row: any) {
  const iso = (v: any) => (v ? (v instanceof Date ? v : new Date(v)).toISOString() : null);
  return {
    ...row,
    unitPrice: parseFloat(row.unitPrice),
    totalValue: parseFloat(row.totalValue),
    costPrice: parseFloat(row.costPrice ?? "0"),
    receivedAt: iso(row.receivedAt),
    sentToSupplierAt: iso(row.sentToSupplierAt),
    resolvedAt: iso(row.resolvedAt),
    returnedToCustomerAt: iso(row.returnedToCustomerAt),
    createdAt: iso(row.createdAt),
  };
}

const createSchema = z.object({
  saleId: z.number().int().positive().nullish(),
  customerId: z.number().int().positive().nullish(),
  customerName: z.string().optional(),
  productId: z.number().int().positive(),
  quantity: z.number().positive().optional(),
  unitPrice: z.number().nonnegative(),
  reason: z.string().nullish(),
  notes: z.string().nullish(),
  date: z.string().optional(),
});

const sendToSupplierSchema = z.object({
  supplierId: z.number().int().positive(),
  notes: z.string().nullish(),
});

const resolveSchema = z.object({
  resolutionType: z.enum(["replacement", "credit"]),
  notes: z.string().nullish(),
  date: z.string().optional(),
});

const returnToCustomerSchema = z.object({
  notes: z.string().nullish(),
  date: z.string().optional(),
});

function handleError(res: any, error: unknown, fallback: string) {
  console.error(fallback, error);
  if (error instanceof claimsService.ClaimValidationError) {
    return res.status(400).json({ error: error.message });
  }
  if (error instanceof MonthClosedError) {
    return res.status(409).json({ error: error.message });
  }
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: "Invalid request", details: error.issues });
  }
  return res.status(500).json({ error: fallback });
}

router.get("/", async (req, res) => {
  try {
    const result = await claimsService.listClaims(req.query as any);
    return res.json({ data: result.data.map(formatClaim), total: result.total, page: result.page, limit: result.limit });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch claims" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = createSchema.parse(req.body);
    const actorUserId = getUserIdFromRequest(req);
    const row = await claimsService.createClaim(body, actorUserId);
    clearCachePrefix("dashboard:recent-activity");
    return res.status(201).json(formatClaim(row));
  } catch (error) {
    return handleError(res, error, "Failed to create claim");
  }
});

router.post("/:id/send-to-supplier", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = sendToSupplierSchema.parse(req.body);
    const actorUserId = getUserIdFromRequest(req);
    const row = await claimsService.sendClaimToSupplier(id, body, actorUserId);
    return res.json(formatClaim(row));
  } catch (error) {
    return handleError(res, error, "Failed to send claim to supplier");
  }
});

router.post("/:id/resolve", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = resolveSchema.parse(req.body);
    const actorUserId = getUserIdFromRequest(req);
    const row = await claimsService.resolveClaim(id, body, actorUserId);
    return res.json(formatClaim(row));
  } catch (error) {
    return handleError(res, error, "Failed to resolve claim");
  }
});

router.post("/:id/return-to-customer", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = returnToCustomerSchema.parse(req.body);
    const actorUserId = getUserIdFromRequest(req);
    const row = await claimsService.returnClaimToCustomer(id, body, actorUserId);
    return res.json(formatClaim(row));
  } catch (error) {
    return handleError(res, error, "Failed to return claim to customer");
  }
});

export default router;
