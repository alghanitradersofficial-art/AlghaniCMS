import type { Request } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

/**
 * Best-effort extraction of the calling user's id from the `Authorization:
 * Bearer <token>` header, used to attribute ledger entries, price history
 * rows, payments, and audit log entries to a real user.
 *
 * Returns `null` when there is no/invalid token.
 */
export function getUserIdFromRequest(req: Request): number | null {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET) as { id?: number };
    return typeof decoded.id === "number" ? decoded.id : null;
  } catch {
    return null;
  }
}

export function getClientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress ?? null;
}
