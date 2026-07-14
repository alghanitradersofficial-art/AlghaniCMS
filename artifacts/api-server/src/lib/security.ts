import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { logger } from "./logger.js";

export function sanitizeInput<T>(value: T): T {
  if (typeof value === "string") {
    return value
      .trim()
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]*>/g, "") as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeInput(item)) as T;
  }

  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      next[key] = sanitizeInput(item);
    }
    return next as T;
  }

  return value;
}

export function normalizeText(value: unknown, maxLength = 200): string {
  if (typeof value !== "string") return "";
  return sanitizeInput(value).slice(0, maxLength).trim();
}

export function validatePassword(password: string): { valid: boolean; reason?: string } {
  const trimmed = password.trim();
  const requireSpecial = process.env.PASSWORD_REQUIRE_SPECIAL === "true";
  if (trimmed.length < 8) return { valid: false, reason: "Password must be at least 8 characters long." };
  if (!/[A-Z]/.test(trimmed)) return { valid: false, reason: "Password must include an uppercase letter." };
  if (!/[a-z]/.test(trimmed)) return { valid: false, reason: "Password must include a lowercase letter." };
  if (!/[0-9]/.test(trimmed)) return { valid: false, reason: "Password must include a number." };
  if (requireSpecial && !/[^A-Za-z0-9]/.test(trimmed)) {
    return { valid: false, reason: "Password must include a special character." };
  }
  return { valid: true };
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0]?.trim() || "unknown";
  return req.ip || "unknown";
}

export function getRequestMetadata(req: Request) {
  return {
    ipAddress: getClientIp(req),
    userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
  };
}

export async function logAuditEvent(
  poolClient: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  entityType: string,
  entityId: number | string | null,
  action: string,
  details: Record<string, unknown> | undefined,
  performedByUserId: number | null,
  req?: Request,
) {
  try {
    const metadata = req ? getRequestMetadata(req) : { ipAddress: null, userAgent: null };
    await poolClient.query(
      `INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, reason, performed_by_user_id, ip_address) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entityType,
        entityId,
        action,
        details ? JSON.stringify({ before: details.before }) : null,
        details ? JSON.stringify({ after: details.after }) : null,
        details?.reason ? String(details.reason) : null,
        performedByUserId,
        metadata.ipAddress,
      ]
    );
  } catch (error) {
    logger.warn({ err: error, entityType, entityId, action }, "Failed to write audit log entry");
  }
}

export function createSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function requestSanitizer(req: Request, _res: Response, next: NextFunction) {
  try {
    const sanitizeObject = (value: unknown): unknown => {
    if (typeof value === "string") {
      return sanitizeInput(value);
    }
    if (Array.isArray(value)) {
      return value.map(sanitizeObject);
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, current]) => [key, sanitizeObject(current)]));
    }
    return value;
    };

    if (req.body && typeof req.body === "object") {
      try {
        const sanitized = sanitizeObject(req.body) as Record<string, unknown> | null;
        const proto = Object.getPrototypeOf(req.body);
        // Only merge into plain objects (safe to mutate). Many frameworks
        // may use getter-only accessors on request properties; avoid
        // mutating those by ensuring the body is a plain object.
        if (sanitized && proto === Object.prototype) {
          for (const [k, v] of Object.entries(sanitized)) {
            try {
              (req.body as Record<string, unknown>)[k] = v;
            } catch (innerErr) {
              logger.warn({ err: innerErr, key: k }, "requestSanitizer: failed to set sanitized body key");
            }
          }
        } else {
          logger.warn({ proto }, "requestSanitizer: skipping merge — request body is not a plain object");
        }
      } catch (err) {
        // fallback: do not block the request if body cannot be mutated
        logger.warn({ err }, "requestSanitizer: failed to merge sanitized body");
      }
    }
    // Note: do not mutate `req.query` or `req.params` directly because some
    // environments expose them as accessor properties. Only sanitize the body
    // (which is commonly a mutable object). Query and params should be
    // validated/sanitized where they are consumed to avoid breaking getter-only
    // request implementations.
    return next();
  } catch (err) {
    logger.warn({ err }, "requestSanitizer: unexpected error, skipping sanitizer");
    return next();
  }
}
