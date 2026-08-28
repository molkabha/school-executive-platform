/**
 * Production admin bootstrap script.
 *
 * seed.ts refuses to run in production (by design — it seeds demo data).
 * This script does exactly one thing: create the single GENERAL_SUPERVISOR
 * account this platform needs, so a fresh production database has someone
 * who can log in. It is safe to run more than once.
 *
 * Usage (run once, after migrations, against the production DATABASE_URL):
 *
 *   ADMIN_EMAIL=supervisor@yourdomain.com \
 *   ADMIN_PASSWORD='choose-a-strong-password' \
 *   ADMIN_NAME='اسم المشرف العام' \
 *   npm run create-admin
 *
 * All three env vars are required. The script exits without changes if a
 * user with that email already exists.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME;

  if (!email || !password || !name) {
    throw new Error(
      'ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_NAME must all be set as environment variables.',
    );
  }

  if (password.length < 10) {
    throw new Error('ADMIN_PASSWORD must be at least 10 characters.');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`A user with email ${email} already exists — no changes made.`);
    return;
  }

  const hashed = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      role: 'GENERAL_SUPERVISOR',
      permissions: '[]',
    },
  });

  console.log(`Created GENERAL_SUPERVISOR account for ${email}. You can now log in.`);
}

main()
  .catch((err) => {
    console.error('create-admin failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
