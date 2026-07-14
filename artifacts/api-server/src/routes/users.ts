import { Router } from 'express';
import { db, users } from '@workspace/db';
import { eq, ilike, sql } from 'drizzle-orm';
import { authMiddleware, hashPassword, generateOTP, requireRole } from '../lib/auth.js';
import { sendOTPEmail } from '../lib/email.js';

const router = Router();
router.use(authMiddleware);

const ALL_PERMISSIONS = [
  'dashboard', 'inventory', 'sales', 'purchases', 'customers', 'suppliers',
  'expenses', 'reports', 'users', 'settings', 'quick-entry', 'operations',
  'months', 'customer-ledger', 'supplier-ledger',
];

router.get('/', async (req, res) => {
  try {
    const { search, role, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const rows = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive, permissions: users.permissions, createdAt: users.createdAt }).from(users).orderBy(users.name).limit(Number(limit)).offset(offset);
    const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(users);
    res.json({ data: rows.map(u => ({ ...u, createdAt: u.createdAt.toISOString() })), total: Number(count), page: Number(page), limit: Number(limit) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/permissions', (_req, res) => {
  res.json(ALL_PERMISSIONS);
});

router.get('/:id', async (req, res) => {
  const [u] = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive, permissions: users.permissions, createdAt: users.createdAt }).from(users).where(eq(users.id, Number(req.params.id)));
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json({ ...u, createdAt: u.createdAt.toISOString() });
});

router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const hashed = await hashPassword(body.password || 'alghani123');
    const [row] = await db.insert(users).values({
      name: body.name, email: body.email.toLowerCase(),
      password: hashed, phone: body.phone,
      role: body.role || 'sales', isActive: body.isActive !== false,
      permissions: body.permissions || [],
    }).returning({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive, permissions: users.permissions, createdAt: users.createdAt });
    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const body = req.body;
    const updateData: any = {
      name: body.name, phone: body.phone,
      role: body.role, isActive: body.isActive,
      permissions: body.permissions,
      updatedAt: new Date(),
    };
    if (body.password) {
      updateData.password = await hashPassword(body.password);
    }
    if (body.email) {
      updateData.email = body.email.toLowerCase();
    }
    const [row] = await db.update(users).set(updateData).where(eq(users.id, Number(req.params.id))).returning({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive, permissions: users.permissions, createdAt: users.createdAt });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ ...row, createdAt: row.createdAt.toISOString() });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  await db.delete(users).where(eq(users.id, Number(req.params.id)));
  res.status(204).send();
});

// Generate OTP for user (admin can generate for any user)
router.post('/:id/generate-otp', async (req, res) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, Number(req.params.id)));
    if (!user) return res.status(404).json({ error: 'User not found' });
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours for admin-generated
    await db.update(users).set({ otp, otpExpiry }).where(eq(users.id, user.id));
    // Send to user's email
    try { await sendOTPEmail(user.email, otp, user.name); } catch {}
    res.json({ message: 'OTP generated and sent to user email', otp }); // show OTP to admin too
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Admin sets password directly
router.post('/:id/set-password', async (req, res) => {
  try {
    const { password } = req.body;
    const hashed = await hashPassword(password);
    await db.update(users).set({ password: hashed, otp: null, otpExpiry: null, updatedAt: new Date() }).where(eq(users.id, Number(req.params.id)));
    res.json({ message: 'Password updated' });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

export default router;
