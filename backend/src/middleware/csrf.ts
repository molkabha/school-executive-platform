import { Request, Response, NextFunction } from 'express';

const isDev = process.env.NODE_ENV !== 'production';
const developmentOrigins = ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:4173'];
const productionFrontendOrigin = process.env.FRONTEND_URL || 'https://school-executive-platform.vercel.app';
const allowedEnvOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim().replace(/\/$/, ''))
  : [];

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  const cleanOrigin = origin.replace(/\/$/, '');
  if (isDev && developmentOrigins.includes(cleanOrigin)) return true;
  if (cleanOrigin === productionFrontendOrigin.replace(/\/$/, '')) return true;
  if (allowedEnvOrigins.includes(cleanOrigin)) return true;
  return false;
}

/**
 * CSRF Protection Middleware
 *
 * For all mutation requests (POST, PUT, PATCH, DELETE) that carry an authentication cookie,
 * verifies that the request originates from an authorized frontend domain via Origin/Referer headers.
 * Rejects cross-origin form submissions and unauthorized cross-site requests.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const mutationMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!mutationMethods.includes(req.method)) {
    return next();
  }

  // If the request carries an authentication cookie, Origin or Referer MUST match allowed origins
  if (req.cookies?.token) {
    const origin = req.headers.origin as string | undefined;
    let refererOrigin: string | undefined;
    if (req.headers.referer) {
      try {
        const url = new URL(req.headers.referer);
        refererOrigin = url.origin;
      } catch {
        // invalid referer url format
      }
    }

    const requestOrigin = origin || refererOrigin;
    if (!requestOrigin || !isAllowedOrigin(requestOrigin)) {
      return res.status(403).json({ message: 'Forbidden: CSRF protection triggered.' });
    }
  }

  next();
}
