import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { prisma } from './prisma';

export function generateToken(payload: object) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT secret not configured');
  }

  return jwt.sign(payload, secret, { expiresIn: '8h' });
}

// Shape of the authenticated user attached to each request.
// Deliberately excludes `password` — see authenticateToken below, which
// strips it before assignment. Keep in sync with the fields the frontend
// and route handlers actually rely on (req.user.id, .role, etc.).
export interface AuthUser {
  id: string;
  email: string;
  role: string;
  permissions?: string[];
  schoolId?: string | null;
  name?: string;
}

// Kept optional to stay structurally compatible with Express's plain
// `Request` type (required here would break `router.use(authenticateToken)`
// typing). In practice every route below is mounted behind
// `authenticateToken`, which populates `user` or responds 401 before
// `next()` — route handlers may use `req.user!` accordingly.
export interface AuthRequest extends Request {
  user?: AuthUser;
}

interface DecodedToken {
  sub: string;
  role?: string;
}

export async function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  // JWT is delivered via a secure httpOnly cookie rather than the Authorization header.
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ message: 'Authentication is not configured' });
    }

    const decoded = jwt.verify(token, secret) as DecodedToken;
    const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    // Strip sensitive fields (e.g. password hash) before attaching to the request.
    // `permissions` is stored in Postgres as a JSON-encoded string (see
    // `permissions String @default("[]")` in prisma/schema.prisma and the
    // `JSON.stringify([...])` writes in prisma/seed.ts), but `AuthUser.permissions`
    // is `string[]` — the same normalization `routes/auth.ts` already applies on
    // login/`/me`. Parse it here too instead of asserting the raw row as AuthUser,
    // so the constructed object genuinely satisfies the interface.
    const { password: _password, permissions, ...safeUser } = user;
    const authUser: AuthUser = {
      ...safeUser,
      permissions: safeJsonParse<string[]>(permissions, []),
    };
    req.user = authUser;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Token invalid or expired' });
  }
}

export function requireSupervisorAccess(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  if (req.user.role !== 'GENERAL_SUPERVISOR') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
}

export async function audit(userId: string | null, action: string, entity: string, entityId: string, details?: string) {
  try {
    await prisma.auditLog.create({
      data: { userId, action, entity, entityId, details: details || '' },
    });
  } catch (error) {
    console.error('[Audit Error]', error);
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function assertSchoolAccess(
  userSchoolId: string | null | undefined,
  entitySchoolId: string | null | undefined,
  res: Response,
): boolean {
  if (userSchoolId && entitySchoolId && userSchoolId !== entitySchoolId) {
    res.status(403).json({ message: 'Forbidden: this record belongs to a different school.' });
    return false;
  }
  return true;
}

