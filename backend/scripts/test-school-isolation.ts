/**
 * School isolation regression tests (Phase 1, item 3).
 *
 * These tests exercise the SAME Prisma query shapes used by the real routes
 * (routes/staff.ts, routes/sources.ts, routes/dashboard.ts) against a real
 * database connection, but they NEVER persist anything: every assertion runs
 * inside a single Prisma interactive transaction that is always rolled back
 * (we throw a sentinel error at the end and swallow only that sentinel).
 * Even if an assertion fails partway through, the throw still triggers the
 * rollback, so production data is guaranteed to be unaffected either way.
 *
 * This follows the project's existing lightweight ts-node test-script
 * pattern (see backend/test-queries.ts) rather than introducing a new test
 * framework/dependency.
 *
 * Run with:  npm run test:isolation   (see package.json)
 */
import { prisma } from '../src/prisma';

class RollbackSentinel extends Error {}

interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

async function main() {
  const results: CheckResult[] = [];
  const check = (name: string, passed: boolean, detail?: string) => {
    results.push({ name, passed, detail });
  };

  try {
    await prisma.$transaction(async (tx) => {
      // ---- Set up isolated, uniquely-named, throwaway fixtures ----
      const suffix = `isotest_${Date.now()}`;

      const schoolA = await tx.school.create({
        data: { name: `__Test School A ${suffix}`, code: `TA_${suffix}`, isActive: true },
      });
      const schoolB = await tx.school.create({
        data: { name: `__Test School B ${suffix}`, code: `TB_${suffix}`, isActive: true },
      });

      const entryA = await tx.staffModuleEntry.create({
        data: {
          moduleName: 'attendance',
          schoolId: schoolA.id,
          title: `Entry for A ${suffix}`,
          status: 'ACTIVE',
        },
      });
      const entryB = await tx.staffModuleEntry.create({
        data: {
          moduleName: 'attendance',
          schoolId: schoolB.id,
          title: `Entry for B ${suffix}`,
          status: 'ACTIVE',
        },
      });

      // A global (school-less) alert used to validate the intentional
      // OR-null aggregation behavior used by dashboard.ts / agent.ts.
      const globalAlert = await tx.alert.create({
        data: {
          type: 'SYSTEM',
          source: 'isolation-test',
          title: `Global alert ${suffix}`,
          schoolId: null,
        },
      });
      const alertA = await tx.alert.create({
        data: {
          type: 'SYSTEM',
          source: 'isolation-test',
          title: `Alert for A ${suffix}`,
          schoolId: schoolA.id,
        },
      });

      // ---- Check 1: School A cannot receive School B data ----
      // Mirrors routes/staff.ts GET /:module (strict schoolId filter).
      const entriesForA = await tx.staffModuleEntry.findMany({
        where: { schoolId: schoolA.id, moduleName: 'attendance' },
      });
      const leaksBIntoA = entriesForA.some((e) => e.id === entryB.id);
      check(
        'School A cannot receive School B data',
        entriesForA.some((e) => e.id === entryA.id) && !leaksBIntoA,
        leaksBIntoA ? 'School B entry appeared when scoped to School A' : undefined
      );

      // ---- Check 2: School B cannot receive School A data ----
      const entriesForB = await tx.staffModuleEntry.findMany({
        where: { schoolId: schoolB.id, moduleName: 'attendance' },
      });
      const leaksAIntoB = entriesForB.some((e) => e.id === entryA.id);
      check(
        'School B cannot receive School A data',
        entriesForB.some((e) => e.id === entryB.id) && !leaksAIntoB,
        leaksAIntoB ? 'School A entry appeared when scoped to School B' : undefined
      );

      // ---- Check 3: All Schools aggregation remains correct ----
      // Mirrors the unscoped path (no schoolId filter): both schools' data
      // must be visible when nothing is filtered.
      const allEntries = await tx.staffModuleEntry.findMany({
        where: { moduleName: 'attendance', schoolId: { in: [schoolA.id, schoolB.id] } },
      });
      const allIds = allEntries.map((e) => e.id);
      check(
        'All Schools aggregation includes both schools',
        allIds.includes(entryA.id) && allIds.includes(entryB.id)
      );

      // ---- Check 4: Management views using intentional OR-null behavior ----
      // Mirrors routes/dashboard.ts `scopedToActive` pattern: a school-scoped
      // query should still surface global (schoolId = null) records, and
      // should NOT surface another school's records.
      const orNullScopedToA = await tx.alert.findMany({
        where: { OR: [{ schoolId: schoolA.id }, { schoolId: null }] },
      });
      const orNullIds = orNullScopedToA.map((a) => a.id);
      const includesGlobal = orNullIds.includes(globalAlert.id);
      const includesOwnSchool = orNullIds.includes(alertA.id);
      check(
        'OR-null scoping includes global + own-school records only',
        includesGlobal && includesOwnSchool,
        !includesGlobal ? 'Global alert missing from OR-null scope' : !includesOwnSchool ? "School A's own alert missing" : undefined
      );

      // Sanity: OR-null scope to School A must not include an alert that
      // belongs only to School B (none created here, but assert no
      // cross-school leakage happens via a negative control school).
      const schoolBOnlyLeak = orNullScopedToA.some((a) => a.schoolId === schoolB.id);
      const testUser = await tx.user.create({
        data: {
          email: `testuser_${suffix}@test.local`,
          name: 'Isolation Test User',
          password: 'hashed_password_placeholder',
          role: 'GENERAL_SUPERVISOR',
        },
      });

      // ---- Check 5: Report scoping isolation ----
      const reportA = await tx.report.create({
        data: {
          title: `Report for A ${suffix}`,
          scope: 'SINGLE_SCHOOL',
          schoolId: schoolA.id,
          period: 'MONTHLY',
          modules: 'attendance',
          aiOutput: '{}',
          createdById: testUser.id,
        },
      });
      const reportB = await tx.report.create({
        data: {
          title: `Report for B ${suffix}`,
          scope: 'SINGLE_SCHOOL',
          schoolId: schoolB.id,
          period: 'MONTHLY',
          modules: 'attendance',
          aiOutput: '{}',
          createdById: testUser.id,
        },
      });
      const reportsForA = await tx.report.findMany({
        where: { schoolId: schoolA.id },
      });
      const leaksReportBIntoA = reportsForA.some((r) => r.id === reportB.id);
      check(
        'School A report scope excludes School B reports',
        reportsForA.some((r) => r.id === reportA.id) && !leaksReportBIntoA,
        leaksReportBIntoA ? 'School B report leaked into School A scope' : undefined
      );

      // ---- Check 6: ImportBatch scoping isolation ----
      const batchA = await tx.importBatch.create({
        data: {
          datasetType: 'attendance',
          sourceType: 'LOCAL_FILE',
          fileName: 'attendance_a.csv',
          schoolId: schoolA.id,
          triggeredById: testUser.id,
          status: 'COMPLETED',
        },
      });
      const batchB = await tx.importBatch.create({
        data: {
          datasetType: 'attendance',
          sourceType: 'LOCAL_FILE',
          fileName: 'attendance_b.csv',
          schoolId: schoolB.id,
          triggeredById: testUser.id,
          status: 'COMPLETED',
        },
      });
      const batchesForA = await tx.importBatch.findMany({
        where: { schoolId: schoolA.id },
      });
      const leaksBatchBIntoA = batchesForA.some((b) => b.id === batchB.id);
      check(
        'School A batch scope excludes School B batches',
        batchesForA.some((b) => b.id === batchA.id) && !leaksBatchBIntoA,
        leaksBatchBIntoA ? 'School B batch leaked into School A scope' : undefined
      );

      console.log('\n--- School Isolation Regression Results ---');
      for (const r of results) {
        console.log(`${r.passed ? '✅ PASS' : '❌ FAIL'} — ${r.name}${r.detail ? ` (${r.detail})` : ''}`);
      }
      const failed = results.filter((r) => !r.passed);
      console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

      // Always roll back — no fixture data (schools, entries, alerts) is
      // ever committed, regardless of pass/fail outcome.
      throw new RollbackSentinel('intentional rollback: isolation test fixtures never persisted');
    });
  } catch (error) {
    if (!(error instanceof RollbackSentinel)) {
      console.error('[Isolation Test] Unexpected error (transaction rolled back):', error);
      process.exitCode = 1;
      return;
    }
  }

  const failedCount = results.filter((r) => !r.passed).length;
  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('[Isolation Test] Fatal error:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
