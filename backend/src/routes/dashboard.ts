import { Router } from 'express';
import { authenticateToken, requireSupervisorAccess, AuthRequest, safeJsonParse, getErrorMessage } from '../utils';
import { prisma } from '../prisma';
const router = Router();

interface SchoolWithSources {
  id: string;
  name: string;
  code: string;
  sources: { id: string; status: string }[];
}

interface StaffModuleEntryRow {
  id: string;
  moduleName: string;
  schoolId: string;
  metrics: string | null;
}

interface AlertRow {
  id: string;
  priority: string;
  status: string;
  title: string;
  details?: string | null;
  schoolId?: string | null;
}

interface KpiSnapshotRow {
  id: string;
  metricName: string;
  value: string;
  schoolId: string | null;
}

interface StaffBySchoolRow {
  schoolId: string;
  schoolName: string;
  staffCount: number;
  attendanceRate: number;
  connectedSources: number;
}

interface ReportWithCreator {
  id: string;
  title: string;
  period: string;
  scope: string;
  createdAt: Date;
  createdBy: { name: string };
}

function buildAttentionItems(
  alerts: any[],
  complaints: any[],
  tasks: any[],
) {
  const items: Array<{
    type: 'alert' | 'complaint' | 'task';
    priority: string;
    title: string;
    school?: string;
    id: string;
  }> = [];

  // Critical/High unresolved alerts
  alerts
    .filter((a) => a.status !== 'RESOLVED' &&
                   (a.priority === 'CRITICAL' || a.priority === 'HIGH'))
    .slice(0, 5)
    .forEach((a) => items.push({
      type: 'alert', priority: a.priority, title: a.title, id: a.id,
    }));

  // Unresolved high/critical complaints
  complaints
    .filter((c) => c.priority === 'CRITICAL' || c.priority === 'HIGH')
    .slice(0, 3)
    .forEach((c) => items.push({
      type: 'complaint', priority: c.priority, title: c.title,
      school: c.school?.name, id: c.id,
    }));

  // Overdue tasks
  tasks.slice(0, 3).forEach((t) => items.push({
    type: 'task', priority: t.priority, title: t.title, id: t.id,
  }));

  // Sort by priority weight
  const priorityWeight: Record<string, number> = {
    CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1,
  };
  items.sort((a, b) =>
    (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0)
  );

  return items.slice(0, 8);
}

router.use(authenticateToken);
router.use(requireSupervisorAccess);

/**
 * GET /api/dashboard
 * Returns aggregated KPIs for the executive dashboard.
 * The supervisor has global access across all schools.
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { schoolId } = req.query as { schoolId?: string };

    // Active-school filtering: matches reportSummary.ts and agent.ts so the
    // dashboard, reports, and AI assistant never disagree on which/how many
    // schools are in scope. Inactive schools' historical rows are kept in the
    // DB but excluded from every aggregate here.
    const activeSchools = await prisma.school.findMany({ where: { isActive: true }, select: { id: true } });
    const activeSchoolIds = activeSchools.map((s: { id: string }) => s.id);
    
    if (schoolId && !activeSchoolIds.includes(schoolId)) {
      return res.status(400).json({ message: 'المدرسة غير صالحة أو غير نشطة' });
    }

    const targetSchoolIds = schoolId ? [schoolId] : activeSchoolIds;
    const scopedToActive = { OR: [{ schoolId: { in: targetSchoolIds } }, { schoolId: null }] };
    // For strict entity scoping (no null fallback)
    const strictSchoolScope = { schoolId: { in: targetSchoolIds } };

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // --- KPIs from StaffModuleEntry + new attention data ---
    const [
      schools,
      allAlerts,
      recentReports,
      staffEntries,
      connectedSources,
      latestKpis,
      todayMeetings,
      openComplaints,
      overdueTasks,
    ] = await Promise.all([
      prisma.school.findMany({
        where: { id: { in: targetSchoolIds }, isActive: true },
        include: {
          sources: { where: { status: 'CONNECTED' } },
        },
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
        where: strictSchoolScope,
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
      // Meetings happening today
      prisma.meeting.findMany({
        where: {
          date: { gte: todayStart, lte: todayEnd },
          status: 'SCHEDULED',
        },
        orderBy: { date: 'asc' },
        take: 10,
      }),
      // Open complaints (not resolved), ordered by priority desc
      prisma.complaint.findMany({
        where: { ...strictSchoolScope, status: { not: 'RESOLVED' } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { school: { select: { name: true } } },
      }),
      // Overdue tasks (dueDate in the past, not done)
      prisma.task.findMany({
        where: {
          ...strictSchoolScope,
          status: { not: 'DONE' },
          dueDate: { lt: now },
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
    ]);

    // Post-filter meetings dynamically because schoolIds is a JSON array string
    const filteredMeetings = todayMeetings.filter((m: any) => {
      try {
        const ids = JSON.parse(m.schoolIds) as string[];
        return ids.some((id) => targetSchoolIds.includes(id));
      } catch {
        return false;
      }
    });

    // Aggregate KPI snapshots (latest per metric per school)
    const kpiMap: Record<string, any> = {};
    for (const kpi of latestKpis) {
      const key = `${kpi.metricName}_${kpi.schoolId || 'all'}`;
      if (!kpiMap[key]) kpiMap[key] = kpi;
    }

    // Build staff by school (from StaffModuleEntry attendance data)
    const staffBySchool = schools.map((school: SchoolWithSources) => {
      const attendanceEntry = staffEntries.find(
        (e: StaffModuleEntryRow) => e.schoolId === school.id && e.moduleName === 'attendance'
      );
      const metrics = attendanceEntry?.metrics
        ? safeJsonParse<Record<string, any>>(attendanceEntry.metrics, {})
        : {};
      return {
        schoolId: school.id,
        schoolName: school.name,
        staffCount: metrics.staffCount || 0,
        attendanceRate: metrics.attendanceRate || 0,
        connectedSources: school.sources.length,
      };
    });

    // Count open issues
    const criticalAlerts = allAlerts.filter((a: AlertRow) => a.priority === 'CRITICAL' || a.priority === 'HIGH');
    const openIssues = allAlerts.filter((a: AlertRow) => a.status === 'OPEN').length;

    // Aggregate totals from KPI snapshots
    const isScoped = targetSchoolIds.length === 1 && !!schoolId;
    const totalStaffKpi = latestKpis.find((k: KpiSnapshotRow) => k.metricName === 'total_staff' && (isScoped ? k.schoolId === schoolId : !k.schoolId)) || latestKpis.find((k: KpiSnapshotRow) => k.metricName === 'total_staff' && !k.schoolId);
    const attendanceKpi = latestKpis.find((k: KpiSnapshotRow) => k.metricName === 'attendance_rate' && (isScoped ? k.schoolId === schoolId : !k.schoolId)) || latestKpis.find((k: KpiSnapshotRow) => k.metricName === 'attendance_rate' && !k.schoolId);
    const turnoverKpi = latestKpis.find((k: KpiSnapshotRow) => k.metricName === 'turnover_count' && (isScoped ? k.schoolId === schoolId : !k.schoolId)) || latestKpis.find((k: KpiSnapshotRow) => k.metricName === 'turnover_count' && !k.schoolId);

    const totalStaff = totalStaffKpi ? Number(totalStaffKpi.value) : staffBySchool.reduce((s: number, sc: StaffBySchoolRow) => s + sc.staffCount, 0);
    const attendanceRate = attendanceKpi ? Number(attendanceKpi.value) : 0;
    const turnoverCount = turnoverKpi ? Number(turnoverKpi.value) : 0;

    // Build the attention panel items (critical alerts + unresolved complaints + overdue tasks)
    const attentionItems = buildAttentionItems(allAlerts, openComplaints, overdueTasks);

    res.json({
      data: {
        totalStaff,
        attendanceRate,
        openIssues,
        turnoverCount,
        pendingActions: criticalAlerts.length,
        staffBySchool,
        recentAlerts: allAlerts.slice(0, 5),
        recentReports: recentReports.map((r: ReportWithCreator) => ({
          id: r.id,
          title: r.title,
          period: r.period,
          scope: r.scope,
          createdAt: r.createdAt,
          createdBy: r.createdBy.name,
        })),
        connectedSourcesCount: connectedSources.length,
        lastUpdated: new Date().toISOString(),
        attentionItems,
        todayMeetings: filteredMeetings.map((m: any) => ({
          id: m.id,
          title: m.title,
          date: m.date,
          location: m.location,
          participants: m.participants,
        })),
        openComplaintsCount: openComplaints.length,
        overdueTasksCount: overdueTasks.length,
      },
    });
  } catch (error: unknown) {
    console.error('[Dashboard Error]', error);
    res.status(500).json({ message: 'Failed to load dashboard data' });
  }
});

export default router;
