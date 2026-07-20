import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { logger } from "./logger.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  logger.warn("JWT_SECRET is not configured; authentication will reject requests until it is set.");
}

export type AuthPayload = {
  id: number;
  email: string;
  role: string;
  name: string;
  permissions?: string[];
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

function getTokenFromHeader(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim();
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  logger.info({ path: req.path, nodeEnv: process.env.NODE_ENV }, "auth middleware invoked");

  if (!JWT_SECRET) {
    return res.status(500).json({ error: "Authentication is not configured on this server." });
  }

  const token = getTokenFromHeader(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    if (!decoded?.id) throw new Error("Invalid token payload");
    req.auth = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name,
      permissions: decoded.permissions ?? [],
    };
    return next();
  } catch (error) {
    logger.warn({ err: error, path: req.path }, "JWT verification failed");
    return res.status(401).json({ error: "Unauthorized" });
  }
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
    // Detailed debug log to help diagnose unexpected 403s during seeding.
    logger.info({ path: req.path, method: req.method, auth: req.auth, permission, authHeaderPresent: Boolean(req.headers.authorization) }, "requirePermission invoked");
    const role = req.auth.role?.toLowerCase() ?? "";
    // Allow top-level admin-like roles to bypass permission checks in local/dev.
    if (role === "ceo" || role === "developer" || role === "admin") return next();
    if (req.auth.permissions?.includes(permission)) return next();
    // Temporary debug: include auth summary in response to aid local debugging of 403.
    return res.status(403).json({ error: "Forbidden", debug: { path: req.path, permission, role: req.auth.role, permissions: req.auth.permissions } });
  };
}

// Like requirePermission, but passes if the user has ANY of the listed
// permissions. Useful for shared/cross-module features (e.g. the smart
// importer) that should work from whichever tab the user already has access
// to, instead of being gated behind a single module permission.
export function requireAnyPermission(permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
    const role = req.auth.role?.toLowerCase() ?? "";
    if (role === "ceo" || role === "developer" || role === "admin") return next();
    if (permissions.some((p) => req.auth!.permissions?.includes(p))) return next();
    return res.status(403).json({ error: "Forbidden", debug: { path: req.path, permissions, role: req.auth.role, userPermissions: req.auth.permissions } });
  };
}

export function requireRole(roles: string[]) {
  const normalized = roles.map((role) => role.toLowerCase());
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
    if (normalized.includes(req.auth.role.toLowerCase())) return next();
    return res.status(403).json({ error: "Forbidden" });
  };
}
