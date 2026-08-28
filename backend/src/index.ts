import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth';
import sourceRoutes from './routes/sources';
import reportRoutes from './routes/reports';
import configRoutes from './routes/config';
import alertRoutes from './routes/alerts';
import auditRoutes from './routes/audit';
import aiRoutes from './routes/ai';
import schoolRoutes from './routes/schools';
import dashboardRoutes from './routes/dashboard';
import staffRoutes from './routes/staff';
import documentRoutes from './routes/documents';
import agentRoutes from './routes/agent';
import complaintRoutes from './routes/complaints';
import taskRoutes from './routes/tasks';
import meetingRoutes from './routes/meetings';
import importRoutes from './routes/imports';
import oauthCallbackRoutes from './routes/oauthCallbacks';
import { loadAIConfig } from './services/ai';
import { prisma } from './prisma';
import crypto from 'crypto';


dotenv.config();

// ---- Environment Validation ----
const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter((v) => !process.env[v]);
if (missingEnvVars.length > 0) {
  console.error(`[FATAL] Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

if (process.env.JWT_SECRET === 'replace_with_a_strong_random_secret_minimum_32_chars' ||
    process.env.JWT_SECRET === 'replace_with_secure_secret' ||
    process.env.JWT_SECRET === 'unsafe_secret') {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    console.error('[FATAL] JWT_SECRET is a placeholder value. This is a critical security risk. Exiting.');
    process.exit(1);
  } else {
    console.warn('[SECURITY WARNING] JWT_SECRET is using a placeholder value. Set a strong secret in .env');
  }
}

if (!process.env.APP_ENCRYPTION_KEY || process.env.APP_ENCRYPTION_KEY.includes('replace_with')) {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    console.error('[FATAL] APP_ENCRYPTION_KEY is missing or is a placeholder value. This is a critical security risk. Exiting.');
    process.exit(1);
  } else {
    console.warn('[SECURITY WARNING] APP_ENCRYPTION_KEY is missing or using a placeholder value. Set a strong secret in .env');
  }
}

// Item 6: Warn if NODE_ENV is not explicitly set to a recognized value.
// This protects against deployments where the secret-placeholder checks below
// are silently skipped because isProduction evaluates to false.
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'development') {
  console.warn(
    `[SECURITY WARNING] NODE_ENV is not set to "production" or "development" (current value: "${process.env.NODE_ENV}"). ` +
    'Placeholder secret checks may not trigger correctly.'
  );
}

const app = express();
const PORT = Number(process.env.PORT) || 10000;
const isDev = process.env.NODE_ENV !== 'production';

app.disable('x-powered-by');
app.set('trust proxy', 1);

// ---- Security Headers ----
app.use(helmet({
  crossOriginEmbedderPolicy: false, // allow loading external resources in dev
  contentSecurityPolicy: isDev ? false : undefined,
}));

import { csrfProtection, isAllowedOrigin } from './middleware/csrf';

// ---- CORS ----
type CorsOriginCallback = (err: Error | null, origin?: boolean | string | RegExp | Array<boolean | string | RegExp>) => void;
const corsOptions = {
  origin: (origin: string | undefined, callback: CorsOriginCallback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (isAllowedOrigin(origin)) return callback(null, true);
    callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ---- Rate Limiting ----
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // stricter for auth endpoints
  message: { message: 'Too many login attempts, please try again in 15 minutes.' },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // AI calls are expensive
  message: { message: 'Too many AI analysis requests. Please wait a moment.' },
});

app.use(globalLimiter);

// ---- Body Parsers & Security Middlewares ----
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(csrfProtection);

// ---- Request ID (for correlating error logs without exposing sensitive data) ----
app.use((req, res, next) => {
  (req as any).requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', (req as any).requestId);
  next();
});

// ---- Health Check ----
// Verifies the process is up AND that the database is reachable, since a
// backend that responds 200 while the DB is down is misleading for uptime
// monitoring. Never includes connection strings, credentials, or stack
// traces in the response.
app.get('/health', async (_req, res) => {
  const startedAt = Date.now();
  let dbStatus: 'ok' | 'error' = 'ok';

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error: unknown) {
    dbStatus = 'error';
    // Log server-side only (no secrets: this is a generic connectivity error,
    // never the DATABASE_URL or credentials).
    console.error('[Health Check] Database connectivity check failed');
  }

  const overallStatus = dbStatus === 'ok' ? 'ok' : 'degraded';
  res.status(dbStatus === 'ok' ? 200 : 503).json({
    status: overallStatus,
    database: dbStatus,
    uptimeSeconds: Math.floor(process.uptime()),
    responseTimeMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  });
});

// ---- Routes ----
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/sources', oauthCallbackRoutes);
app.use('/api/sources', sourceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/config', configRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);
app.use('/api/agent', aiLimiter, agentRoutes);
app.use('/api/imports', importRoutes);

app.use('/api/schools', schoolRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/meetings', meetingRoutes);

// ---- 404 Handler ----
app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// ---- Global Error Handler ----
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const requestId = (req as any).requestId || 'unknown';

  // Log method/path/status/requestId for correlation. Never log request
  // bodies, headers, cookies, or query strings here — they can carry
  // passwords, JWTs, or API keys. Full stack traces are only logged (not
  // returned to the client) and only in development.
  console.error(
    `[Error] request=${requestId} method=${req.method} path=${req.path} status=${err.status || 500} message=${err.message || 'Internal server error'}`
  );
  if (isDev && err.stack) {
    console.error(err.stack);
  }

  // CORS errors
  if (err.message?.startsWith('CORS:')) {
    return res.status(403).json({ message: 'Access denied by CORS policy', requestId });
  }

  res.status(err.status || 500).json({
    message: isDev ? (err.message || 'Internal server error') : 'Internal server error',
    requestId,
    ...(isDev && { stack: err.stack }),
  });
});

// ---- Start Server ----
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  // Load AI config for startup logs (DB has priority)
  loadAIConfig()
    .then((cfg) => {
      console.log(`   AI Provider: ${cfg.provider} (${cfg.model})`);
    })
    .catch((err) => {
      // If AI config cannot be loaded, fall back to environment display but do not force provider
      const envProvider = process.env.AI_PROVIDER || 'not-configured';
      const envModel = process.env.AI_MODEL || process.env.OPENAI_MODEL || 'not-configured';
      console.log(`   AI Provider: ${envProvider} (${envModel})`);
      if (process.env.NODE_ENV === 'development') console.warn('[AI Config Warning]', err.message);
    });
});

async function shutdown(signal: string) {
  console.log(`[Shutdown] Received ${signal}. Closing HTTP server...`);
  server.close(async () => {
    console.log('[Shutdown] HTTP server closed. Disconnecting database...');
    await prisma.$disconnect();
    console.log('[Shutdown] Database disconnected. Exiting.');
    process.exit(0);
  });

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    console.error('[Shutdown] Forced exit after timeout.');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

export default app;

