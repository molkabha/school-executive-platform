import { prisma } from './src/prisma';
import { getExecutiveSummaryToday } from './src/services/agent';

async function run() {
  console.log('Testing dashboard.ts queries...');
  try {
    const activeSchools = await prisma.school.findMany({ where: { isActive: true }, select: { id: true } });
    const activeSchoolIds = activeSchools.map(s => s.id);
    const scopedToActive = { OR: [{ schoolId: { in: activeSchoolIds } }, { schoolId: null }] };

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    await Promise.all([
      prisma.school.findMany({
        where: { isActive: true },
        include: { sources: { where: { status: 'CONNECTED' } } },
      }),
      prisma.alert.findMany({
        where: { ...scopedToActive, status: { not: 'RESOLVED' } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.report.findMany({
        where: scopedToActive,
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { createdBy: { select: { name: true } } },
      }),
      prisma.staffModuleEntry.findMany({
        where: { schoolId: { in: activeSchoolIds } },
        include: { school: { select: { name: true } } },
      }),
      prisma.dataSource.findMany({
        where: { ...scopedToActive, status: 'CONNECTED' },
      }),
      prisma.kpiSnapshot.findMany({
        where: scopedToActive,
        orderBy: { date: 'desc' },
        take: 20,
        include: { school: { select: { name: true } } },
      }),
      prisma.meeting.findMany({
        where: {
          date: { gte: todayStart, lte: todayEnd },
          status: 'SCHEDULED',
        },
        orderBy: { date: 'asc' },
        take: 10,
      }),
      prisma.complaint.findMany({
        where: { status: { not: 'RESOLVED' } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { school: { select: { name: true } } },
      }),
      prisma.task.findMany({
        where: {
          status: { not: 'DONE' },
          dueDate: { lt: now },
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
    ]);
    console.log('Dashboard queries SUCCESS');
  } catch (err) {
    console.error('Dashboard queries FAILED:', err);
  }

  console.log('\nTesting agent.ts queries...');
  try {
    const summary = await getExecutiveSummaryToday();
    console.log('Agent queries SUCCESS, result:', summary.summaryTitle);
  } catch (err) {
    console.error('Agent queries FAILED:', err);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
