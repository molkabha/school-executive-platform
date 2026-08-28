import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { generateToken, authenticateToken, audit, AuthRequest, safeJsonParse, getErrorMessage } from '../utils';
import { prisma } from '../prisma';
import { validateBody, loginSchema } from '../middleware/validate';
const router = Router();

// Records a failed login attempt in the existing audit log without ever
// persisting the submitted password, JWT, or any other sensitive auth
// material. The email is included only as a non-sensitive identifier for
// investigating repeated failures (it is what the user typed, not a secret).
async function recordFailedLogin(email: string, reason: 'unknown_email' | 'invalid_password', userId: string | null) {
  await audit(userId, 'failed_login', 'User', userId || 'unknown', `Failed login attempt for ${email} (${reason})`);
}

// Item 9 (last-login visibility): implemented WITHOUT a schema change by
// deriving the timestamp from the existing AuditLog table instead of adding
// a `lastLoginAt` column to User. Every successful login is now recorded as
// a 'login' audit entry (see below); this looks up the most recent one.
async function getLastLoginAt(userId: string): Promise<Date | null> {
  const lastLogin = await prisma.auditLog.findFirst({
    where: { userId, action: 'login', entity: 'User' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return lastLogin?.createdAt ?? null;
}

const AUTH_COOKIE_NAME = 'token';
const AUTH_COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8h, matches JWT expiresIn

function getAuthCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  // The frontend (Vercel) and backend (Render) are on different origins, so the
  // browser classifies every request as cross-site.  SameSite=Strict silently
  // drops the cookie on all such requests — including the /api/auth/me call that
  // restores the session — causing the 401.  SameSite=None is the correct value
  // for cross-origin cookie sharing; it REQUIRES Secure (HTTPS) which is always
  // true on Render in production, preventing any actual security regression.
  // In development (same-origin localhost) we fall back to 'lax' so the cookie
  // still works without HTTPS.
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
    path: '/',
  };
}

/**
 * POST /api/auth/login
 */
router.post('/login', validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      await recordFailedLogin(email.toLowerCase(), 'unknown_email', null);
      return res.status(401).json({ message: 'بيانات الدخول غير صحيحة' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      await recordFailedLogin(email.toLowerCase(), 'invalid_password', user.id);
      return res.status(401).json({ message: 'بيانات الدخول غير صحيحة' });
    }

    // Parse permissions from JSON string
    const permissions = safeJsonParse<string[]>(
      user.permissions,
      user.permissions ? [user.permissions] : []
    );

    // Capture the previous login timestamp BEFORE recording this one, so the
    // response can show "last login" (the prior session), not this session.
    const previousLoginAt = await getLastLoginAt(user.id);

    const token = generateToken({ sub: user.id, role: user.role });

    // Load school info if applicable
    let schoolName: string | undefined;
    if (user.schoolId) {
      const school = await prisma.school.findUnique({ where: { id: user.schoolId } });
      schoolName = school?.name;
    }

    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());

    await audit(user.id, 'login', 'User', user.id, `Successful login for ${user.email}`);

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
        schoolName,
        permissions,
        lastLoginAt: previousLoginAt,
      },
    });
  } catch (error: unknown) {
    console.error('[Login Error]', getErrorMessage(error));
    res.status(500).json({ message: 'Login failed due to a server error' });
  }
});

/**
 * POST /api/auth/logout
 * Clear the auth cookie.
 */
router.post('/logout', (_req, res) => {
  const { httpOnly, secure, sameSite, path } = getAuthCookieOptions();
  res.clearCookie(AUTH_COOKIE_NAME, { httpOnly, secure, sameSite, path });
  res.json({ message: 'Logged out' });
});

/**
 * GET /api/auth/me
 * Return current user info from JWT.
 */
router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { school: { select: { id: true, name: true } } },
    });

    if (!user) return res.status(404).json({ message: 'User not found' });

    const permissions = safeJsonParse<string[]>(user.permissions, []);
    const lastLoginAt = await getLastLoginAt(user.id);

    res.json({
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
        schoolName: user.school?.name,
        permissions,
        createdAt: user.createdAt,
        lastLoginAt,
      },
    });
  } catch (error: unknown) {
    void error;
    res.status(500).json({ message: 'Failed to load user profile' });
  }
});

export default router;
