// Language support is locked to Arabic only.
// The dynamic language context/provider/hook has been removed.

export const dictionary: Record<string, string> = {
  // Navigation
  dashboard: 'لوحة المتابعة التنفيذية',
  assistant: 'المساعد الذكي',
  staff: 'متابعة المدارس والكادر',
  dataCenter: 'مركز البيانات',
  sources: 'مصادر البيانات',
  documents: 'المستندات والملفات',
  reports: 'التقارير التنفيذية',
  alerts: 'التنبيهات والمخاطر',
  settings: 'إعدادات الذكاء الاصطناعي',

  // Header Action
  generateMonthlyReport: 'توليد التقرير الشهري',
  supervisorScope: 'إشراف عام - جميع المدارس',

  // Sidebar Groups
  mainGroup: 'الرئيسية',
  operationsGroup: 'العمليات اليومية',
  complaints: 'شكاوى أولياء الأمور',
  tasks: 'المهام المعلقة',
  meetings: 'الاجتماعات',
  staffGroup: 'متابعة الكادر التعليمي',
  dataReportsGroup: 'البيانات والتقارير',
  systemGroup: 'النظام والإعدادات',
  auditLogs: 'سجلات النظام',

  // Buttons & UI Controls
  showMore: 'عرض المزيد',
  showLess: 'عرض أقل',
  showingLimit: 'عرض 4 عناصر فقط',
  logout: 'تسجيل الخروج',
  generalSupervisor: 'المشرفة التنفيذية العامة',
  protectedInterface: 'واجهة تنفيذية محمية',

  // Modal / Common
  cancel: 'إلغاء',
  confirm: 'تأكيد',
  generateReportModalTitle: 'إنشاء التقرير التنفيذي الشهري',
  generateReportModalDesc: 'سيقوم الذكاء الاصطناعي بتحليل كافة بيانات المدارس المسجلة وإنشاء تقرير شامل.',
  startGeneration: 'بدء توليد التقرير الآن',
  generating: 'جاري التوليد...',

  // Last login (Item 9 — derived from AuditLog, no schema change)
  lastLoginLabel: 'آخر تسجيل دخول',
  lastLoginNever: 'أول تسجيل دخول',
};

/** Returns the Arabic translation for a dictionary key, or the key itself as fallback. */
export function t(key: string): string {
  return dictionary[key] ?? key;
}
