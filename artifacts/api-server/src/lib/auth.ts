import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { type Request, type Response, type NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'alghani-erp-secret-2026';

export interface JwtPayload {
  userId: number;
  email: string;
  role: string;
  permissions: string[];
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    (req as any).user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as JwtPayload;
    if (!user || (!roles.includes(user.role) && !roles.includes('*'))) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
