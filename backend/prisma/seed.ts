/**
 * Realistic Seed Data for Executive Follow-up Management Platform
 * 
 * Creates:
 * - 4 schools with unique codes
 * - 1 General Supervisor account
 * - 10 staff modules with data sources
 * - KPI snapshots per school
 * - Staff module entries with metrics
 * - Document references
 * - Alerts (open, in-progress)
 * - App configuration (AI provider)
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed script is disabled in production.');
  }

  const password = await bcrypt.hash('School2026!', 10);

  // ---- Schools ----
  const [schoolA, schoolB, schoolC, schoolD] = await Promise.all([
    prisma.school.upsert({
      where: { code: 'school1' },
      create: { name: 'مدرسة الإبداع الأولى', code: 'school1' },
      update: { name: 'مدرسة الإبداع الأولى' },
    }),
    prisma.school.upsert({
      where: { code: 'school2' },
      create: { name: 'مدرسة التميز الثانية', code: 'school2' },
      update: { name: 'مدرسة التميز الثانية' },
    }),
    prisma.school.upsert({
      where: { code: 'school3' },
      create: { name: 'مدرسة الريادة الثالثة', code: 'school3' },
      update: { name: 'مدرسة الريادة الثالثة' },
    }),
    prisma.school.upsert({
      where: { code: 'school4' },
      create: { name: 'مدرسة النخبة الرابعة', code: 'school4' },
      update: { name: 'مدرسة النخبة الرابعة' },
    }),
  ]);
  console.log('✅ Schools created');

  // ---- Single General Supervisor Account ----
  await prisma.user.deleteMany({
    where: { email: { not: 'supervisor@schools-group.sa' } },
  });

  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@schools-group.sa' },
    create: {
      name: 'المشرفة العامة',
      email: 'supervisor@schools-group.sa',
      password,
      role: 'GENERAL_SUPERVISOR',
      permissions: JSON.stringify(['global_supervision_access']),
    },
    update: {
      name: 'المشرفة العامة',
      role: 'GENERAL_SUPERVISOR',
      schoolId: null,
      permissions: JSON.stringify(['global_supervision_access']),
    },
  });
  console.log('✅ Single Supervisor Account Verified (supervisor@schools-group.sa)');


  // ---- App Config ----
  for (const [key, value] of [
    ['ai_provider', process.env.AI_PROVIDER || 'openai'],
    ['ai_model', process.env.OPENAI_MODEL || 'gpt-4o-mini'],
    ['ai_api_key', process.env.OPENAI_API_KEY || ''],
    ['ai_base_url', process.env.AI_BASE_URL || ''],
  ]) {
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
  console.log('✅ App config created');

  // ---- Data Sources ----
  const sourceDefs = [
    {
      name: 'Attendance_2026.xlsx',
      type: 'GOOGLE_DRIVE',
      provider: 'GOOGLE_DRIVE',
      module: 'attendance',
      status: 'CONNECTED',
      externalUrl: 'https://drive.google.com/file/d/demo_attendance',
      metadata: { format: 'xlsx', description: 'ملف حضور الكادر الشهري', size: '245KB' },
      school: schoolA,
    },
    {
      name: 'Attendance_All_Schools_Q2.xlsx',
      type: 'GOOGLE_DRIVE',
      provider: 'GOOGLE_DRIVE',
      module: 'attendance',
      status: 'CONNECTED',
      externalUrl: 'https://onedrive.live.com/demo_attendance_all',
      metadata: { format: 'xlsx', description: 'حضور جميع المدارس - الربع الثاني', size: '512KB' },
      school: schoolA, // supervisor-level
    },
    {
      name: 'Housing_Report_2026.xlsx',
      type: 'GOOGLE_DRIVE',
      provider: 'GOOGLE_DRIVE',
      module: 'housing',
      status: 'CONNECTED',
      externalUrl: 'https://drive.google.com/file/d/demo_housing',
      metadata: { format: 'xlsx', description: 'تقرير قضايا سكن المعلمين', size: '128KB' },
      school: schoolB,
    },
    {
      name: 'Teacher_Feedback_Q2.xlsx',
      type: 'EXCEL_UPLOAD',
      provider: 'EXCEL_UPLOAD',
      module: 'teacher_voice',
      status: 'CONNECTED',
      externalUrl: null,
      metadata: { format: 'xlsx', description: 'استبيانات صوت المعلم - الربع الثاني', size: '89KB' },
      school: schoolC,
    },
    {
      name: 'Workforce_Plan_2025_2026.xlsx',
      type: 'GOOGLE_DRIVE',
      provider: 'GOOGLE_DRIVE',
      module: 'workforce_plan',
      status: 'CONNECTED',
      externalUrl: 'https://sharepoint.com/sites/schools/demo_workforce',
      metadata: { format: 'xlsx', description: 'خطة القوى العاملة السنوية', size: '320KB', lastModifiedBy: 'مسؤول الموارد البشرية' },
      school: schoolA,
    },
    {
      name: 'Staff_Allocation_Matrix.xlsx',
      type: 'GOOGLE_DRIVE',
      provider: 'GOOGLE_DRIVE',
      module: 'allocation',
      status: 'CONNECTED',
      externalUrl: 'https://drive.google.com/file/d/demo_allocation',
      metadata: { format: 'xlsx', description: 'مصفوفة توزيع المعلمين على المدارس', size: '156KB' },
      school: schoolA,
    },
    {
      name: 'Turnover_Analysis_2026.xlsx',
      type: 'GOOGLE_DRIVE',
      provider: 'GOOGLE_DRIVE',
      module: 'turnover',
      status: 'CONNECTED',
      externalUrl: 'https://onedrive.live.com/demo_turnover',
      metadata: { format: 'xlsx', description: 'تحليل دوران الكادر - الفصل الثاني', size: '95KB' },
      school: schoolD,
    },
    {
      name: 'Professional_Dev_Plan.xlsx',
      type: 'GOOGLE_DRIVE',
      provider: 'GOOGLE_DRIVE',
      module: 'professional_development',
      status: 'NOT_CONNECTED',
      externalUrl: null,
      metadata: { format: 'xlsx', description: 'خطط التطوير المهني - لم يتم ربطها بعد' },
      school: schoolB,
    },
    {
      name: 'New_Staff_Onboarding_Q2.xlsx',
      type: 'EXCEL_UPLOAD',
      provider: 'EXCEL_UPLOAD',
      module: 'new_staff',
      status: 'CONNECTED',
      externalUrl: null,
      metadata: { format: 'xlsx', description: 'متابعة الموظفين الجدد - الربع الثاني', size: '67KB' },
      school: schoolC,
    },
    {
      name: 'Wellbeing_Survey_Results.xlsx',
      type: 'GOOGLE_DRIVE',
      provider: 'GOOGLE_DRIVE',
      module: 'wellbeing',
      status: 'NOT_CONNECTED',
      externalUrl: null,
      metadata: { format: 'xlsx', description: 'نتائج استبيان الرفاهية - لم يتم ربطها' },
      school: schoolD,
    },
    {
      name: 'Staff_Evaluation_Results_Q1.xlsx',
      type: 'GOOGLE_DRIVE',
      provider: 'GOOGLE_DRIVE',
      module: 'evaluation',
      status: 'CONNECTED',
      externalUrl: 'https://sharepoint.com/sites/schools/demo_evaluation',
      metadata: { format: 'xlsx', description: 'نتائج التقييم المهني - الربع الأول', size: '210KB' },
      school: schoolA,
    },
  ];

  const createdSources: Record<string, any> = {};
  for (const def of sourceDefs) {
    const source = await prisma.dataSource.create({
      data: {
        name: def.name,
        type: def.type,
        provider: def.provider,
        module: def.module,
        status: def.status,
        ownerId: supervisor.id,
        schoolId: def.school.id,
        externalUrl: def.externalUrl,
        lastSync: def.status === 'CONNECTED' ? new Date() : null,
        metadata: JSON.stringify(def.metadata),
        connectionConfig: def.status === 'CONNECTED' ? JSON.stringify({ autoSync: true }) : null,
        analysisHistory: '[]',
      },
    });
    createdSources[def.module] = source;
  }
  console.log('✅ Data sources created');

  // ---- Documents ----
  const docDefs = [
    {
      name: 'تقرير حضور المعلمين - مايو 2026',
      sourceType: 'GOOGLE_DRIVE',
      module: 'attendance',
      externalUrl: 'https://drive.google.com/file/d/demo_doc_attendance',
      school: schoolA,
      metadata: { format: 'xlsx', period: 'مايو 2026', schools: 4 },
    },
    {
      name: 'شكاوى سكن - الفصل الثاني',
      sourceType: 'GMAIL',
      module: 'housing',
      externalUrl: null,
      school: schoolB,
      metadata: { format: 'email', count: 7, urgentCount: 2 },
    },
    {
      name: 'خطة القوى العاملة 2025-2026',
      sourceType: 'GOOGLE_DRIVE',
      module: 'workforce_plan',
      externalUrl: 'https://sharepoint.com/sites/schools/workforce_plan_2026',
      school: schoolA,
      metadata: { format: 'xlsx', lastModified: '2026-03-15', version: '2.1' },
    },
    {
      name: 'نتائج استبيان صوت المعلم - أبريل',
      sourceType: 'GOOGLE_DRIVE',
      module: 'teacher_voice',
      externalUrl: 'https://drive.google.com/file/d/demo_teacher_voice',
      school: schoolC,
      metadata: { format: 'xlsx', respondents: 45, satisfactionScore: 3.7 },
    },
    {
      name: 'تقرير دوران الكادر - الربع الأول',
      sourceType: 'GOOGLE_DRIVE',
      module: 'turnover',
      externalUrl: 'https://onedrive.live.com/demo_turnover_q1',
      school: schoolD,
      metadata: { format: 'pdf', leavers: 4, joiners: 2 },
    },
  ];

  for (const doc of docDefs) {
    await prisma.document.create({
      data: {
        name: doc.name,
        sourceType: doc.sourceType,
        module: doc.module,
        externalUrl: doc.externalUrl,
        ownerId: supervisor.id,
        schoolId: doc.school.id,
        metadata: JSON.stringify(doc.metadata),
        analysisHistory: '[]',
        lastUpdated: new Date(),
      },
    });
  }
  console.log('✅ Documents created');

  // ---- Staff Module Entries ----
  const staffEntries = [
    // Attendance - all 4 schools
    { module: 'attendance', school: schoolA, title: 'حضور مدرسة الإبداع', status: 'GOOD', metrics: { staffCount: 78, attendanceRate: 96.2, absentCount: 3, lateCount: 1 } },
    { module: 'attendance', school: schoolB, title: 'حضور مدرسة التميز', status: 'GOOD', metrics: { staffCount: 82, attendanceRate: 95.1, absentCount: 4, lateCount: 2 } },
    { module: 'attendance', school: schoolC, title: 'حضور مدرسة الريادة', status: 'NEEDS_ATTENTION', metrics: { staffCount: 75, attendanceRate: 91.8, absentCount: 6, lateCount: 5 } },
    { module: 'attendance', school: schoolD, title: 'حضور مدرسة النخبة', status: 'GOOD', metrics: { staffCount: 77, attendanceRate: 94.6, absentCount: 4, lateCount: 2 } },
    // Housing
    { module: 'housing', school: schoolA, title: 'قضايا سكن - الإبداع', status: 'NEEDS_ATTENTION', metrics: { openIssues: 2, resolvedIssues: 5, criticalIssues: 1, categories: ['تكييف', 'صيانة'] } },
    { module: 'housing', school: schoolB, title: 'قضايا سكن - التميز', status: 'CRITICAL', metrics: { openIssues: 4, resolvedIssues: 3, criticalIssues: 2, categories: ['كهرباء', 'تسرب مياه', 'تكييف'] } },
    { module: 'housing', school: schoolC, title: 'قضايا سكن - الريادة', status: 'GOOD', metrics: { openIssues: 1, resolvedIssues: 8, criticalIssues: 0, categories: ['صيانة'] } },
    { module: 'housing', school: schoolD, title: 'قضايا سكن - النخبة', status: 'NEEDS_ATTENTION', metrics: { openIssues: 2, resolvedIssues: 4, criticalIssues: 1 } },
    // Turnover
    { module: 'turnover', school: schoolA, title: 'دوران كادر - الإبداع', status: 'GOOD', metrics: { leavers: 1, joiners: 2, turnoverRate: 1.3, riskLevel: 'low' } },
    { module: 'turnover', school: schoolB, title: 'دوران كادر - التميز', status: 'NEEDS_ATTENTION', metrics: { leavers: 3, joiners: 1, turnoverRate: 3.7, riskLevel: 'medium' } },
    { module: 'turnover', school: schoolC, title: 'دوران كادر - الريادة', status: 'CRITICAL', metrics: { leavers: 4, joiners: 1, turnoverRate: 5.3, riskLevel: 'high' } },
    { module: 'turnover', school: schoolD, title: 'دوران كادر - النخبة', status: 'GOOD', metrics: { leavers: 2, joiners: 3, turnoverRate: 2.6, riskLevel: 'low' } },
    // Teacher Voice
    { module: 'teacher_voice', school: schoolA, title: 'صوت المعلم - الإبداع', status: 'GOOD', metrics: { respondents: 45, satisfactionScore: 4.1, topIssue: 'الجدول الدراسي', positiveSentiment: 72 } },
    { module: 'teacher_voice', school: schoolC, title: 'صوت المعلم - الريادة', status: 'NEEDS_ATTENTION', metrics: { respondents: 38, satisfactionScore: 3.4, topIssue: 'ضغط العمل', positiveSentiment: 55 } },
    // New Staff
    { module: 'new_staff', school: schoolA, title: 'الموظفون الجدد - الإبداع', status: 'ACTIVE', metrics: { newHires: 5, completedOnboarding: 3, pendingOnboarding: 2, avgOnboardingDays: 14 } },
    { module: 'new_staff', school: schoolC, title: 'الموظفون الجدد - الريادة', status: 'NEEDS_ATTENTION', metrics: { newHires: 3, completedOnboarding: 1, pendingOnboarding: 2, avgOnboardingDays: 22 } },
  ];

  for (const entry of staffEntries) {
    await prisma.staffModuleEntry.create({
      data: {
        moduleName: entry.module,
        schoolId: entry.school.id,
        title: entry.title,
        status: entry.status,
        metrics: JSON.stringify(entry.metrics),
      },
    });
  }
  console.log('✅ Staff module entries created');

  // ---- KPI Snapshots ----
  const today = new Date();
  const kpiData = [
    // Global KPIs (no schoolId)
    { metricName: 'total_staff', value: '312', schoolId: null },
    { metricName: 'attendance_rate', value: '94.4', schoolId: null },
    { metricName: 'turnover_count', value: '10', schoolId: null },
    { metricName: 'open_issues', value: '9', schoolId: null },
    // Per-school
    { metricName: 'total_staff', value: '78', schoolId: schoolA.id },
    { metricName: 'attendance_rate', value: '96.2', schoolId: schoolA.id },
    { metricName: 'total_staff', value: '82', schoolId: schoolB.id },
    { metricName: 'attendance_rate', value: '95.1', schoolId: schoolB.id },
    { metricName: 'total_staff', value: '75', schoolId: schoolC.id },
    { metricName: 'attendance_rate', value: '91.8', schoolId: schoolC.id },
    { metricName: 'total_staff', value: '77', schoolId: schoolD.id },
    { metricName: 'attendance_rate', value: '94.6', schoolId: schoolD.id },
  ];

  for (const kpi of kpiData) {
    await prisma.kpiSnapshot.create({
      data: {
        metricName: kpi.metricName,
        value: kpi.value,
        schoolId: kpi.schoolId,
        date: today,
      },
    });
  }
  console.log('✅ KPI snapshots created');

  // ---- Alerts ----
  const alertDefs = [
    {
      type: 'HOUSING',
      source: 'housing',
      priority: 'CRITICAL',
      title: 'تسرب كهربائي في سكن مدرسة التميز - يتطلب تدخلاً فورياً',
      details: 'أفاد 3 معلمين بوجود مشكلة كهربائية خطيرة في المبنى السكني. بانتظار فريق الصيانة.',
      schoolId: schoolB.id,
      status: 'OPEN',
    },
    {
      type: 'ATTENDANCE',
      source: 'attendance',
      priority: 'HIGH',
      title: 'انخفاض حضور مدرسة الريادة إلى 91.8%',
      details: 'تراجعت نسبة الحضور في مدرسة الريادة خلال الأسبوعين الماضيين. تحتاج لمراجعة الأسباب.',
      schoolId: schoolC.id,
      status: 'IN_PROGRESS',
    },
    {
      type: 'TURNOVER',
      source: 'turnover',
      priority: 'HIGH',
      title: 'معدل دوران مرتفع في مدرسة الريادة - 5.3%',
      details: 'غادر 4 معلمين هذا الفصل من مدرسة الريادة. يُنصح بمراجعة عوامل الرضا الوظيفي.',
      schoolId: schoolC.id,
      status: 'OPEN',
    },
    {
      type: 'TEACHER_VOICE',
      source: 'teacher_voice',
      priority: 'MEDIUM',
      title: 'انخفاض مستوى الرضا في مدرسة الريادة - 3.4/5',
      details: 'أشارت نتائج استبيان صوت المعلم إلى انخفاض الرضا عن ضغط العمل وجدولة الاختبارات.',
      schoolId: schoolC.id,
      status: 'OPEN',
    },
    {
      type: 'HOUSING',
      source: 'housing',
      priority: 'HIGH',
      title: 'تراكم شكاوى السكن في مدرسة التميز - 4 قضايا مفتوحة',
      details: 'لم يتم حل 4 قضايا سكن منذ أكثر من 3 أسابيع في مدرسة التميز.',
      schoolId: schoolB.id,
      status: 'IN_PROGRESS',
    },
    {
      type: 'DOCUMENT',
      source: 'workforce_plan',
      priority: 'MEDIUM',
      title: 'ملف خطة القوى العاملة لم يُحدَّث منذ 12 يوماً',
      details: 'آخر تحديث لملف خطة القوى العاملة كان في 20 يوليو. يُرجى المراجعة والتحديث.',
      schoolId: null,
      status: 'OPEN',
    },
    {
      type: 'ATTENDANCE',
      source: 'attendance',
      priority: 'LOW',
      title: 'لا يوجد ملف حضور مرتبط لمدرسة التميز هذا الشهر',
      details: 'لم يتم رفع ملف الحضور الشهري لمدرسة التميز حتى الآن.',
      schoolId: schoolB.id,
      status: 'OPEN',
    },
  ];

  for (const alert of alertDefs) {
    await prisma.alert.create({ data: alert });
  }
  console.log('✅ Alerts created');

  // ---- Sample Executive Report ----
  await prisma.report.create({
    data: {
      title: 'التقرير التنفيذي الشهري - يوليو 2026',
      scope: 'ALL_SCHOOLS',
      period: 'MONTHLY',
      modules: 'attendance,housing,turnover,teacher_voice',
      aiOutput: JSON.stringify({
        executiveSummary: 'شهد شهر يوليو 2026 استقراراً عاماً في أداء الكادر التعليمي في 3 من أصل 4 مدارس. بلغت نسبة الحضور الكلية 94.4% مع تراجع ملحوظ في مدرسة الريادة. تحتاج مدرسة التميز اهتماماً عاجلاً في ملف السكن.',
        mainChanges: [
          'ارتفاع نسبة الحضور في مدرسة الإبداع بمقدار 0.8% مقارنة بيونيو',
          'تراجع نسبة الحضور في مدرسة الريادة من 94.1% إلى 91.8%',
          'تسجيل 4 حالات مغادرة في مدرسة الريادة خلال الفصل',
          'إغلاق 8 قضايا سكن بنجاح في 3 مدارس',
        ],
        importantIssues: [
          'أزمة كهربائية في سكن مدرسة التميز تتطلب تدخلاً فورياً',
          'معدل دوران مرتفع في مدرسة الريادة يُشير إلى مشكلة هيكلية',
          'انخفاض رضا المعلمين في مدرسة الريادة إلى 3.4/5',
        ],
        risks: [
          'استمرار الدوران المرتفع في الريادة قد يؤثر على جودة التعليم الفصل القادم',
          'تأخر حل قضايا السكن قد يُفاقم مستوى الرضا الوظيفي',
          'عدم تحديث ملف خطة القوى العاملة يُعيق التخطيط الاستراتيجي',
        ],
        recommendations: [
          'تشكيل لجنة طارئة لمعالجة قضايا السكن في مدرسة التميز خلال 48 ساعة',
          'مقابلات فردية مع الكادر في مدرسة الريادة لتحديد أسباب التراجع',
          'مراجعة جدول الدوام في مدرسة الريادة وتوزيع الأعباء',
          'تحديث ملف خطة القوى العاملة فوراً وجدولة مراجعة دورية أسبوعية',
        ],
        requiredActions: [
          { action: 'حل أزمة الكهرباء في سكن التميز', owner: 'مدير مدرسة التميز', deadline: 'خلال 48 ساعة' },
          { action: 'مراجعة أسباب الدوران في الريادة', owner: 'مسؤول الموارد البشرية', deadline: 'الأسبوع القادم' },
          { action: 'تحديث ملف خطة القوى العاملة', owner: 'مسؤول الموارد البشرية', deadline: 'خلال 3 أيام' },
        ],
      }),
      createdById: supervisor.id,
      schoolId: null,
    },
  });
  console.log('✅ Sample report created');

  // ---- Complaints ----
  await prisma.complaint.deleteMany({});
  const complaintDefs = [
    {
      schoolId: schoolA.id, source: 'WHATSAPP', priority: 'HIGH',
      title: 'شكوى من ولي أمر بخصوص تأخر صرف المكافآت',
      description: 'يطالب ولي الأمر بمعرفة سبب تأخر صرف مكافأة ابنه المتفوق منذ شهرين',
      assignedTo: 'مدير مدرسة الإبداع', status: 'OPEN',
    },
    {
      schoolId: schoolB.id, source: 'EMAIL', priority: 'CRITICAL',
      title: 'شكوى عاجلة: ظروف الإقامة في السكن غير صحية',
      description: 'رصدنا عطلاً في نظام التكييف في جناح ج، مما أثر على ظروف الإقامة لـ 12 معلمًا',
      assignedTo: 'مسؤول السكن', status: 'IN_PROGRESS',
    },
    {
      schoolId: schoolC.id, source: 'PHONE', priority: 'MEDIUM',
      title: 'استفسار عن جدول الاجتماعات الشهري',
      description: 'يطلب ولي الأمر جدول اجتماعات أولياء الأمور لهذا الفصل الدراسي',
      assignedTo: null, status: 'OPEN',
    },
    {
      schoolId: schoolD.id, source: 'WALK_IN', priority: 'HIGH',
      title: 'شكوى من معلم بشأن التحرش في بيئة العمل',
      description: 'تقدم معلم بشكوى رسمية ضد زميل بسبب تصرفات غير لائقة خلال الاجتماع الأسبوعي',
      assignedTo: 'لجنة الموارد البشرية', status: 'IN_PROGRESS',
    },
    {
      schoolId: schoolA.id, source: 'EMAIL', priority: 'LOW',
      title: 'اقتراح تحسين نظام متابعة الحضور الإلكتروني',
      description: 'يقترح ولي الأمر إنشاء بوابة إلكترونية لمتابعة حضور ابنه بشكل يومي',
      assignedTo: null, status: 'RESOLVED',
      resolutionNote: 'تم تحويل المقترح إلى فريق التطوير التقني',
    },
    {
      schoolId: schoolB.id, source: 'WHATSAPP', priority: 'MEDIUM',
      title: 'عدم وجود بديل للمعلم الغائب في حصة الرياضيات',
      description: 'يفيد ولي الأمر بأن طلاب الصف الثالث لم يحصلوا على حصة رياضيات لأسبوعين بسبب غياب المعلم',
      assignedTo: 'نائب مدير المدرسة', status: 'OPEN',
    },
  ];

  for (const c of complaintDefs) {
    await prisma.complaint.create({
      data: {
        schoolId: c.schoolId,
        source: c.source,
        title: c.title,
        description: c.description,
        priority: c.priority,
        status: c.status,
        assignedTo: c.assignedTo || null,
        resolutionNote: (c as any).resolutionNote || null,
        resolvedAt: c.status === 'RESOLVED' ? new Date() : null,
      },
    });
  }
  console.log('✅ Complaints seeded (6)');

  // ---- Tasks ----
  await prisma.task.deleteMany({});
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const taskDefs = [
    {
      title: 'مراجعة وإغلاق شكاوى السكن المفتوحة',
      description: 'مراجعة جميع شكاوى السكن في مدرستي التميز والريادة وإعداد تقرير بالإجراءات المتخذة',
      schoolId: null, priority: 'CRITICAL', status: 'OPEN', dueDate: yesterday,
      assignedTo: 'المشرفة العامة',
    },
    {
      title: 'اعتماد خطط القوى العاملة للفصل الدراسي القادم',
      description: 'مراجعة وتوقيع خطط التوظيف للمدارس الأربعة قبل بداية الفصل',
      schoolId: null, priority: 'HIGH', status: 'IN_PROGRESS', dueDate: threeDaysAgo,
      assignedTo: 'مسؤول الموارد البشرية',
    },
    {
      title: 'زيارة ميدانية لمدرسة النخبة الرابعة',
      description: 'جدولة زيارة ميدانية لمتابعة مستجدات التوظيف وظروف الكادر',
      schoolId: schoolD.id, priority: 'MEDIUM', status: 'OPEN', dueDate: nextWeek,
      assignedTo: 'المشرفة العامة',
    },
    {
      title: 'تحديث بيانات الحضور في النظام',
      description: 'رفع بيانات حضور الكادر لشهر يوليو في نظام المتابعة',
      schoolId: schoolA.id, priority: 'HIGH', status: 'OPEN', dueDate: tomorrow,
      assignedTo: 'مسؤول البيانات',
    },
    {
      title: 'إعداد التقرير الشهري لمجلس الإدارة',
      description: 'تجميع مؤشرات الأداء الرئيسية وإعداد العرض التقديمي الشهري',
      schoolId: null, priority: 'CRITICAL', status: 'OPEN', dueDate: nextWeek,
      assignedTo: 'المشرفة العامة',
    },
  ];

  for (const t of taskDefs) {
    await prisma.task.create({
      data: {
        title: t.title,
        description: t.description,
        schoolId: t.schoolId || null,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate,
        assignedTo: t.assignedTo,
      },
    });
  }
  console.log('✅ Tasks seeded (5)');

  // ---- Meetings ----
  await prisma.meeting.deleteMany({});
  const todayAt10 = new Date();
  todayAt10.setHours(10, 0, 0, 0);
  const todayAt14 = new Date();
  todayAt14.setHours(14, 0, 0, 0);
  const nextMonday = new Date();
  nextMonday.setDate(nextMonday.getDate() + ((7 - nextMonday.getDay()) % 7 || 7));
  nextMonday.setHours(9, 0, 0, 0);

  await prisma.meeting.createMany({
    data: [
      {
        title: 'اجتماع متابعة التنبيهات الحرجة مع مدراء المدارس',
        date: todayAt10,
        location: 'قاعة الاجتماعات الرئيسية — مبنى الإدارة',
        schoolIds: JSON.stringify([schoolA.id, schoolB.id, schoolC.id, schoolD.id]),
        participants: 'المشرفة العامة، مدراء المدارس الأربعة، مسؤول الموارد البشرية',
        agenda: 'مراجعة التنبيهات المفتوحة، متابعة شكاوى السكن، خطط الإجراءات التصحيحية',
        status: 'SCHEDULED',
      },
      {
        title: 'اجتماع مراجعة خطط الدوران الوظيفي',
        date: todayAt14,
        location: 'مكتب المشرفة العامة',
        schoolIds: JSON.stringify([schoolC.id, schoolD.id]),
        participants: 'المشرفة العامة، مسؤول الموارد البشرية، مدير مدرسة الريادة',
        agenda: 'تحليل أسباب ارتفاع دوران الكادر، خطة الاستبقاء',
        status: 'SCHEDULED',
      },
      {
        title: 'اجتماع المجلس الاستشاري الفصلي',
        date: nextMonday,
        location: 'قاعة الاجتماعات الكبرى',
        schoolIds: JSON.stringify([schoolA.id, schoolB.id, schoolC.id, schoolD.id]),
        participants: 'المشرفة العامة، مجلس الأمناء، مدراء المدارس',
        agenda: 'عرض نتائج الفصل الدراسي، خطة الفصل القادم، مناقشة الميزانية',
        status: 'SCHEDULED',
      },
    ],
  });
  console.log('✅ Meetings seeded (3 — 2 today, 1 next week)');

  console.log('\n✨ Seed completed successfully!\n');
  console.log('  📧 Supervisor account:');
  console.log('     supervisor@schools-group.sa / School2026!  (GENERAL_SUPERVISOR)');
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

