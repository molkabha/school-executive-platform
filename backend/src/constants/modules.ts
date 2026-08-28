// Single source of truth for the platform's staff/workforce module catalog.
// Both `routes/staff.ts` (full module definitions) and `routes/sources.ts`
// (id + display name only, for the Sources module dropdown) derive from
// this list so they never drift out of sync (see audit item C7).

export interface StaffModuleDefinition {
  id: string;
  title: string;
  titleEn: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  responsiblePerson: string;
  sources: string[];
  kpis: string[];
  actions: string[];
  reports: string[];
}

export const STAFF_MODULES: StaffModuleDefinition[] = [
  // ── Category 1: القوى العاملة والتخطيط ──────────────────────────────
  {
    id: 'workforce_plan',
    title: 'خطة القوى العاملة',
    titleEn: 'Workforce Planning',
    description: 'ربط خطة القوى العاملة ومتابعة سد الاحتياجات والشواغر الهيكلية عبر المدارس.',
    icon: 'fa-briefcase',
    color: '#1E3A5F',
    category: 'workforce',
    responsiblePerson: 'مدراء المدارس',
    sources: ['EXCEL_UPLOAD', 'GOOGLE_DRIVE'],
    kpis: ['نسبة الشواغر المغطاة', 'إجمالي الوظائف المعتمدة', 'معدل سد الاحتياج'],
    actions: ['مراجعة الاحتياج الفصلي', 'اعتماد ملاك المدارس'],
    reports: ['تقرير الاحتياج الشهري', 'تقرير الملاك الفصلي', 'تقرير الشواغر السنوي'],
  },
  {
    id: 'allocation',
    title: 'توزيع الحصص',
    titleEn: 'Allocation',
    description: 'مقارنة توزيع المعلمين عبر جميع المدارس وكشف النصاب والفجوات.',
    icon: 'fa-sitemap',
    color: '#2563EB',
    category: 'workforce',
    responsiblePerson: 'المديرون الأكاديميون',
    sources: ['EXCEL_UPLOAD', 'GOOGLE_DRIVE'],
    kpis: ['متوسط النصاب الأسبوعي', 'معدل التوازن بين المدارس', 'الفجوات التخصصية'],
    actions: ['إعادة توزيع النصاب الفائض', 'تغطية الانتدابات'],
    reports: ['تقرير توزيع الحصص الأسبوعي', 'تقرير الفجوات التخصصية'],
  },
  {
    id: 'recruitment',
    title: 'الاستقطاب والتوظيف',
    titleEn: 'Recruitment',
    description: 'متابعة مراحل المقابلات واختيار الكفاءات وعقود التوظيف الجديدة.',
    icon: 'fa-user-gear',
    color: '#6366F1',
    category: 'workforce',
    responsiblePerson: 'الموارد البشرية',
    sources: ['EXCEL_UPLOAD', 'GOOGLE_DRIVE'],
    kpis: ['عدد المقابلات المكتملة', 'متوسط زمن التوظيف', 'معدل قبول العروض'],
    actions: ['جدولة المقابلات النهائية', 'اعتماد عقود المرشحين'],
    reports: ['تقرير الاستقطاب الشهري', 'تقرير أداء التوظيف'],
  },
  {
    id: 'new_staff',
    title: 'الموظفون الجدد',
    titleEn: 'New Staff Onboarding',
    description: 'متابعة الموظفين الجدد وبرامج التهيئة والدمج والتقييم التجريبي.',
    icon: 'fa-user-plus',
    color: '#059669',
    category: 'workforce',
    responsiblePerson: 'الموارد البشرية',
    sources: ['EXCEL_UPLOAD', 'GOOGLE_DRIVE'],
    kpis: ['إكتمال برنامج التهيئة', 'معدل التكيف الوظيفي', 'تقييم فترة التجربة'],
    actions: ['تعيين المعلم المرشد', 'إجراء التقييم الشهر الأول'],
    reports: ['تقرير الموظفين الجدد الشهري', 'تقرير نتائج التقييم التجريبي'],
  },

  // ── Category 2: الحضور والبيئة الوظيفية ──────────────────────────────
  {
    id: 'attendance',
    title: 'الحضور والانصراف',
    titleEn: 'Attendance',
    description: 'متابعة نسبة حضور الكادر التعليمي يومياً ومقارنة الالتزام بالمدارس.',
    icon: 'fa-user-check',
    color: '#047857',
    category: 'attendance_wellbeing',
    responsiblePerson: 'مديرو المراحل / الموارد البشرية',
    sources: ['EXCEL_UPLOAD', 'GOOGLE_DRIVE'],
    kpis: ['نسبة الحضور اليومي', 'عدد الإجازات المرضية', 'معدل التأخير الأسبوعي'],
    actions: ['متابعة الحالات المتكررة', 'إصدار التنبيهات'],
    reports: ['تقرير الحضور الأسبوعي', 'تقرير الغيابات الشهري', 'تقرير الحضور الفصلي'],
  },
  {
    id: 'housing',
    title: 'السكن والإقامة',
    titleEn: 'Accommodation & Housing',
    description: 'تتبع قضايا سكن المعلمين والإقامة وتصنيف الملاحظات وتحليل الحلول.',
    icon: 'fa-house-chimney',
    color: '#B45309',
    category: 'attendance_wellbeing',
    responsiblePerson: 'مسؤول السكن / الموارد البشرية',
    sources: ['GMAIL', 'EXCEL_UPLOAD'],
    kpis: ['نسبة إشغال السكن', 'عدد طلبات الصيانة المفتوحة', 'معدل رضا الساكنين'],
    actions: ['معالجة صيانة المجمع السكني', 'تجديد عقود الإيجار'],
    reports: ['تقرير قضايا السكن الشهري', 'تقرير الصيانة الفصلي'],
  },
  {
    id: 'wellbeing',
    title: 'الرفاهية والصحة النفسية',
    titleEn: 'Staff Wellbeing',
    description: 'متابعة مبادرات الرفاهية والأنشطة الاجتماعية وقياس جودة البيئة.',
    icon: 'fa-heart-pulse',
    color: '#DC2626',
    category: 'attendance_wellbeing',
    responsiblePerson: 'منسق الرفاهية والأنشطة',
    sources: ['EXCEL_UPLOAD', 'GOOGLE_DRIVE'],
    kpis: ['مؤشر السعادة الوظيفية', 'معدل المشاركة في الفعاليات', 'مبادرات الرفاهية المكتملة'],
    actions: ['إطلاق التحدي الرياضي', 'تكريم المناسبات الخاصة'],
    reports: ['تقرير الرفاهية الفصلي', 'نتائج استبيان بيئة العمل'],
  },
  {
    id: 'teacher_voice',
    title: 'صوت المعلم',
    titleEn: 'Teacher Voice',
    description: 'تحليل ملاحظات وآراء الكادر من الإيميلات والاستبيانات الدورية.',
    icon: 'fa-comments',
    color: '#7C3AED',
    category: 'attendance_wellbeing',
    responsiblePerson: 'مستشار التواصل الوظيفي',
    sources: ['GMAIL', 'GOOGLE_DRIVE'],
    kpis: ['مؤشر رضا المعلمين', 'عدد المقترحات المقدمة', 'معدل استجابة الإدارة'],
    actions: ['عقد لقاء مفتوح مع الكادر', 'معالجة الشكاوى الإدارية'],
    reports: ['تقرير صوت المعلم الشهري', 'التقرير السنوي للشكاوى والمقترحات'],
  },

  // ── Category 3: التطوير والتميز المهني ──────────────────────────────
  {
    id: 'professional_development',
    title: 'التطوير المهني',
    titleEn: 'Professional Development',
    description: 'متابعة خطط البرامج التدريبية وتقارير الأثر والنمو المهني للمعلمين.',
    icon: 'fa-graduation-cap',
    color: '#0891B2',
    category: 'development',
    responsiblePerson: 'مشرف التدريب والتطوير الأكاديمي',
    sources: ['EXCEL_UPLOAD', 'GOOGLE_DRIVE'],
    kpis: ['ساعات التدريب المنجزة', 'نسبة مشاركة الكادر', 'مؤشر أثر التدريب في الفصل'],
    actions: ['تنظيم ورشة عمل التخصصات', 'تقييم الحقائب التدريبية'],
    reports: ['تقرير التدريب الفصلي', 'تقرير أثر التطوير المهني السنوي'],
  },
  {
    id: 'teacher_of_month',
    title: 'معلم الشهر والمتميزين',
    titleEn: 'Teacher of the Month',
    description: 'متابعة ترشيحات التميز وحوافز الأداء وتكريم المعلمين المبدعين.',
    icon: 'fa-award',
    color: '#D97706',
    category: 'development',
    responsiblePerson: 'لجنة التميز والتقدير',
    sources: ['EXCEL_UPLOAD', 'GOOGLE_DRIVE'],
    kpis: ['عدد الترشيحات المعتمدة', 'معدل المشاركة بالمدارس', 'المكافآت الموزعة'],
    actions: ['فرز معايير التميز', 'إعلان المعلم الفائز'],
    reports: ['تقرير التميز الشهري', 'تقرير الحوافز الفصلي'],
  },
  {
    id: 'lesson_observation',
    title: 'الملاحظات الصفية والزيارات',
    titleEn: 'Lesson Observation',
    description: 'توثيق الزيارات الصفية للمشرفين والمدراء وتحليل جودة التدريس.',
    icon: 'fa-eye',
    color: '#2563EB',
    category: 'development',
    responsiblePerson: 'فريق الإشراف التربوي الأكاديمي',
    sources: ['EXCEL_UPLOAD', 'GOOGLE_DRIVE'],
    kpis: ['عدد الزيارات الصفية المنفذة', 'مؤشر جودة الاستراتيجيات', 'التوصيات الصفية المتابعة'],
    actions: ['جدولة زيارات الدعم الأكاديمي', 'تقديم التغذية الراجعة'],
    reports: ['تقرير الزيارات الصفية الشهري', 'تقرير جودة التدريس الفصلي'],
  },

  // ── Category 4: الحوكمة والتقييم ──────────────────────────────────
  {
    id: 'evaluation',
    title: 'التقييم المهني للأداء',
    titleEn: 'Staff Evaluation',
    description: 'متابعة نتائج التقييم السنوي والتقارير وتحليل مستويات الأداء بالذكاء الاصطناعي.',
    icon: 'fa-star-half-stroke',
    color: '#CA8A04',
    category: 'governance',
    responsiblePerson: 'رئيس لجنة التقييم والقياس',
    sources: ['EXCEL_UPLOAD', 'GOOGLE_DRIVE'],
    kpis: ['نسبة التقييمات المكتملة', 'متوسط الأداء العام', 'الفئات المحتاجة لدعم'],
    actions: ['اعتماد تقارير الأداء السنوي', 'وضع خطط التحسين'],
    reports: ['تقرير التقييم الفصلي', 'التقرير السنوي لمستويات الأداء'],
  },
  {
    id: 'committees',
    title: 'المجالس واللجان',
    titleEn: 'Committees & Governance',
    description: 'متابعة تشكيل اللجان المدرسية والمحاضر ومتابعة القرارات المنبثقة.',
    icon: 'fa-users-between-lines',
    color: '#475569',
    category: 'governance',
    responsiblePerson: 'أمين سر المجالس التنفيذية',
    sources: ['EXCEL_UPLOAD', 'GOOGLE_DRIVE'],
    kpis: ['عدد اللجان النشطة', 'نسبة تنفيذ القرارات', 'محاضر الاجتماعات المحفوظة'],
    actions: ['متابعة توصيات لجنة الأداء', 'أرشفة محاضر الاجتماع'],
    reports: ['تقرير القرارات الشهري', 'تقرير نشاط اللجان الفصلي'],
  },
  {
    id: 'calendar',
    title: 'التقويم والأجندة التشغيلية',
    titleEn: 'Operational Calendar',
    description: 'متابعة الأجندة الزمنية للفعاليات والاختبارات ومواعيد تسليم التقارير.',
    icon: 'fa-calendar-days',
    color: '#0F766E',
    category: 'governance',
    responsiblePerson: 'منسق العمليات الأكاديمية',
    sources: ['GOOGLE_DRIVE'],
    kpis: ['نسبة الالتزام بالجدول', 'الفعاليات المكتملة', 'المواعيد الحرجة القادمة'],
    actions: ['تحديث مواعيد الاختبارات', 'اعتماد التقويم الفصل'],
    reports: ['تقرير الالتزام بالتقويم الشهري'],
  },
  {
    id: 'turnover',
    title: 'دوران الكادر والمغادرة',
    titleEn: 'Staff Turnover',
    description: 'تحليل بيانات الاستقالات وخروج الكادر واكتشاف أسباب التسرب مبكراً.',
    icon: 'fa-right-left',
    color: '#B91C1C',
    category: 'governance',
    responsiblePerson: 'مسؤول الاستبقاء ومقابلات الخروج',
    sources: ['EXCEL_UPLOAD', 'GOOGLE_DRIVE'],
    kpis: ['نسبة دوران الكادر السنوية', 'أسباب المغادرة الرئيسية', 'مؤشر الاستقرار الوظيفي'],
    actions: ['إجراء مقابلات خروج', 'تحديث خطة الاستبقاء'],
    reports: ['تقرير الاستقالات الشهري', 'تقرير أسباب المغادرة الفصلي', 'التقرير السنوي للتسرب'],
  },
];

export const STAFF_MODULE_IDS: readonly string[] = STAFF_MODULES.map((m) => m.id);

// Compact { id, name } shape used by the Sources module dropdown/list.
export const SOURCE_MODULE_OPTIONS = STAFF_MODULES.map((m) => ({ id: m.id, name: m.title }));

