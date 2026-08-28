export type SourceType =
  | 'GOOGLE_DRIVE'
  | 'EXCEL_UPLOAD'
  | 'GMAIL'
  | 'ONEDRIVE'
  | 'SHAREPOINT'
  | 'OUTLOOK'
  | 'GOOGLE_SHEETS'
  | 'POWERPOINT'
  | 'WORD'
  | 'PDF_DOC'
  | 'ONENOTE';

export type UserRole = 'GENERAL_SUPERVISOR';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  schoolId?: string | null;
  schoolName?: string;
  permissions: string[];
  createdAt?: string;
  // Item 9: derived from the AuditLog's 'login' entries (no schema change).
  // On login response this is the PREVIOUS session's login time; on GET /me
  // it's the most recent recorded login. Null if never recorded before.
  lastLoginAt?: string | null;
}

export interface School {
  id: string;
  name: string;
  code: string;
  isActive?: boolean;
  sources?: Array<{ lastSync?: string | null }>;
  _count?: { sources?: number; reports?: number };
}

export interface DataSource {
  id: string;
  name: string;
  type: SourceType;
  provider: string;
  status: 'CONNECTED' | 'NOT_CONNECTED' | 'ERROR';
  module: string;
  lastSync?: string | null;
  ownerId: string;
  owner: { id: string; name: string };
  schoolId?: string | null;
  school?: { id: string; name: string } | null;
  externalFileId?: string | null;
  externalUrl?: string | null;
  metadata?: Record<string, any>;
  connectionConfig?: Record<string, any>;
  analysisHistory?: AIAnalysisResult[];
  createdAt: string;
  updatedAt: string;
}

export interface DocumentItem {
  id: string;
  name: string;
  sourceType: SourceType;
  externalUrl?: string | null;
  module: string;
  lastUpdated: string;
  metadata?: Record<string, any>;
  analysisHistory?: AIAnalysisResult[];
  ownerId: string;
  owner: { id: string; name: string };
  schoolId?: string | null;
  school?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffModuleDef {
  id: string;
  title: string;
  titleEn: string;
  description: string;
  icon: string;
  color: string;
  category?: string;
  responsiblePerson?: string;
  kpis?: string[];
  actions?: string[];
  reports?: string[];
  entries?: StaffModuleEntryData[];
}

export interface StaffModuleEntryData {
  id: string;
  schoolId?: string;
  schoolName: string;
  title?: string;
  status: 'ACTIVE' | 'NEEDS_ATTENTION' | 'CRITICAL' | 'GOOD';
  metrics: Record<string, any>;
  notes?: string | null;
  linkedDocument?: string | null;
  sourceRefs?: string[];
  updatedAt: string;
}

// ---- Attention / Dashboard ----

export interface AttentionItem {
  type: 'alert' | 'complaint' | 'task';
  priority: string;
  title: string;
  school?: string;
  id: string;
}

export interface TodayMeeting {
  id: string;
  title: string;
  date: string;
  location?: string | null;
  participants?: string | null;
}

export interface DashboardData {
  totalStaff: number;
  attendanceRate: number;
  openIssues: number;
  turnoverCount: number;
  pendingActions: number;
  staffBySchool: Array<{
    schoolId: string;
    schoolName: string;
    staffCount: number;
    attendanceRate: number;
    connectedSources: number;
  }>;
  recentAlerts: AlertItem[];
  recentReports: Array<{
    id: string;
    title: string;
    period: string;
    scope: string;
    createdAt: string;
    createdBy: string;
  }>;
  connectedSourcesCount: number;
  lastUpdated: string;
  // New attention fields
  attentionItems: AttentionItem[];
  todayMeetings: TodayMeeting[];
  openComplaintsCount: number;
  overdueTasksCount: number;
}

export interface AlertItem {
  id: string;
  type: 'ATTENDANCE' | 'HOUSING' | 'TURNOVER' | 'TEACHER_VOICE' | 'SYSTEM' | 'DOCUMENT';
  source: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  details?: string | null;
  schoolId?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportItem {
  id: string;
  title: string;
  scope: 'ALL_SCHOOLS' | 'SCHOOL_SPECIFIC';
  period: 'WEEKLY' | 'MONTHLY' | 'SEMESTER';
  modules: string[];
  aiOutput: AIReportOutput;
  createdById: string;
  createdBy: { id: string; name: string };
  schoolId?: string | null;
  school?: { id: string; name: string } | null;
  createdAt: string;
}

export interface AIAnalysisResult {
  executiveSummary: string;
  mainChanges: string[];
  risks: string[];
  recommendations: string[];
  requiredActions?: string[];
  analyzedAt?: string;
  raw?: string;
}

export interface AIReportOutput {
  coverPage?: {
    organization?: string;
    reportTitle?: string;
    reportingPeriod?: string;
    generationDate?: string;
    executiveLabel?: string;
  };
  executiveSummary: string;
  mainChanges: string[];
  importantIssues?: string[];
  kpiDashboard?: Array<{
    label: string;
    value: string | number;
    percentage?: string;
    trend?: string;
    meaning?: string;
  }>;
  chartData?: {
    attendanceEvolution?: Array<{ label: string; value: number }>;
    schoolComparison?: Array<{ label: string; value: number }>;
    performanceTrends?: Array<{ label: string; value: number }>;
    issueDistribution?: Array<{ label: string; value: number }>;
    taskStatus?: Array<{ label: string; value: number }>;
  };
  riskAnalysis?: Array<{
    risk: string;
    impact: string;
    priority: string;
    recommendedAction: string;
  }>;
  risks: string[];
  recommendations: Array<string | {
    action: string;
    responsiblePerson?: string;
    deadline?: string;
    expectedImpact?: string;
  }>;
  requiredActions?: Array<{ action: string; owner: string; deadline: string }>;
  finalConclusion?: string;
}

export interface AgentMessageItem {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  dataSourcesUsed?: string[];
  lastDataUpdate?: string;
  reportGenerated?: {
    id: string;
    title: string;
  } | null;
  reportId?: string | null;
  createdAt?: string;
  generatedBy?: 'ai' | 'database';
  aiUsed?: boolean;
}

export interface AgentResponse {
  answer: string;
  dataSourcesUsed: string[];
  lastDataUpdate: string;
  reportGenerated?: {
    id: string;
    title: string;
  } | null;
  generatedBy: 'ai' | 'database';
  aiUsed: boolean;
}

export interface ExecutiveSummaryToday {
  summaryTitle: string;
  highlights: string[];
  recommendedAction: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  lastScannedAt: string;
  fromCache?: boolean;
}

// ---- Complaint ----

export interface Complaint {
  id: string;
  schoolId: string;
  school: { id: string; name: string };
  source: 'WHATSAPP' | 'PHONE' | 'EMAIL' | 'WALK_IN' | 'OTHER';
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  assignedTo?: string | null;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---- Task ----

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  schoolId?: string | null;
  school?: { id: string; name: string } | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE';
  dueDate?: string | null;
  assignedTo?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---- Meeting ----

export interface Meeting {
  id: string;
  title: string;
  date: string;
  location?: string | null;
  schoolIds: string; // JSON string
  schoolNames?: Array<{ id: string; name: string }>;
  participants?: string | null;
  agenda?: string | null;
  status: 'SCHEDULED' | 'DONE' | 'CANCELLED';
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}
