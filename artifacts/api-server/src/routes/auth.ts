import { Router } from 'express';
import { db } from '@workspace/db';
import { users } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { signToken, comparePassword, hashPassword, generateOTP, authMiddleware } from '../lib/auth.js';
import { sendOTPEmail } from '../lib/email.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.isActive) return res.status(403).json({ error: 'Account disabled' });

    const valid = await comparePassword(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      permissions: (user.permissions as string[]) || [],
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
        isActive: user.isActive,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  const u = (req as any).user;
  const [user] = await db.select().from(users).where(eq(users.id, u.userId)).limit(1);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: user.permissions || [],
    isActive: user.isActive,
  });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (!user) return res.status(404).json({ error: 'Email not found' });

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.update(users).set({ otp, otpExpiry }).where(eq(users.id, user.id));
    await sendOTPEmail(user.email, otp, user.name);

    res.json({ message: 'OTP sent to email' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (!user || user.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });
    if (!user.otpExpiry || new Date() > user.otpExpiry) return res.status(400).json({ error: 'OTP expired' });
    res.json({ message: 'OTP verified', userId: user.id });
  } catch {
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (!user || user.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });
    if (!user.otpExpiry || new Date() > user.otpExpiry) return res.status(400).json({ error: 'OTP expired' });

    const hashed = await hashPassword(newPassword);
    await db.update(users).set({ password: hashed, otp: null, otpExpiry: null }).where(eq(users.id, user.id));
    res.json({ message: 'Password reset successfully' });
  } catch {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
