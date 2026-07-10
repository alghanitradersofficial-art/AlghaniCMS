import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { logger } from "./logger.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
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
    const role = req.auth.role?.toLowerCase() ?? "";
    if (role === "ceo" || role === "developer") return next();
    if (req.auth.permissions?.includes(permission)) return next();
    return res.status(403).json({ error: "Forbidden" });
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
