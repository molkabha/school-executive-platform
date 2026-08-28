import { DatasetType } from './types';

type HeaderAliasMap = Record<string, string[]>;

export interface DatasetDefinition {
  key: DatasetType;
  label: string;
  description: string;
  requiredHeaders: string[];
  optionalHeaders: string[];
  headerAliases: HeaderAliasMap;
}

const attendanceAliases: HeaderAliasMap = {
  schoolCode: ['school code', 'school_code', 'schoolcode', 'code'],
  attendanceRate: ['attendance %', 'attendance rate', 'attendance_rate', 'attendance'],
  absenceCount: ['absence count', 'absent count', 'absence_count', 'absences'],
  status: ['status'],
  notes: ['notes', 'note'],
  period: ['period', 'reporting period', 'report_period'],
};

const schoolsAliases: HeaderAliasMap = {
  name: ['name', 'school name', 'school_name'],
  code: ['code', 'school code', 'school_code'],
  isActive: ['active', 'is active', 'is_active', 'status'],
};

const housingAliases: HeaderAliasMap = {
  schoolCode: ['school code', 'school_code', 'code'],
  housingIssueCount: ['open issues', 'housing issue count', 'issue count', 'open_issues'],
  housingCategory: ['category', 'housing category'],
  housingSeverity: ['severity', 'housing severity'],
  status: ['status'],
  notes: ['notes', 'note'],
  period: ['period', 'reporting period'],
};

const complaintsAliases: HeaderAliasMap = {
  schoolCode: ['school code', 'school_code', 'code'],
  source: ['source', 'channel'],
  title: ['title', 'complaint title'],
  description: ['description', 'details'],
  priority: ['priority'],
  status: ['status'],
  assignedTo: ['assigned to', 'assigned_to'],
  resolutionNote: ['resolution note', 'resolution_note'],
};

const tasksAliases: HeaderAliasMap = {
  schoolCode: ['school code', 'school_code', 'code'],
  title: ['title'],
  description: ['description', 'details'],
  priority: ['priority'],
  status: ['status'],
  dueDate: ['due date', 'due_date'],
  assignedTo: ['assigned to', 'assigned_to'],
};

const meetingsAliases: HeaderAliasMap = {
  title: ['title'],
  date: ['date', 'meeting date'],
  location: ['location'],
  schoolCodes: ['school codes', 'school_codes', 'schools'],
  participants: ['participants'],
  agenda: ['agenda'],
  status: ['status'],
  notes: ['notes', 'note'],
};

const staffAliases: HeaderAliasMap = {
  schoolCode: ['school code', 'school_code', 'code'],
  title: ['title'],
  status: ['status'],
  notes: ['notes', 'note'],
  attendanceRate: ['attendance %', 'attendance rate', 'attendance_rate'],
  absenceCount: ['absence count', 'absence_count'],
  housingIssueCount: ['housing issue count', 'open issues', 'housing_issue_count'],
  housingCategory: ['housing category', 'category'],
  housingSeverity: ['housing severity', 'severity'],
  resolutionSla: ['resolution sla', 'sla'],
  metricsJson: ['metrics', 'metrics json', 'metrics_json'],
  moduleName: ['module', 'module name', 'module_name'],
  period: ['period', 'reporting period'],
};

const kpiAliases: HeaderAliasMap = {
  metricName: ['metric name', 'metric_name'],
  value: ['value', 'metric value'],
  schoolCode: ['school code', 'school_code', 'code'],
  date: ['date', 'snapshot date'],
};

export const DATASET_DEFINITIONS: Record<DatasetType, DatasetDefinition> = {
  attendance: {
    key: 'attendance',
    label: 'Attendance',
    description: 'School attendance data mapped into StaffModuleEntry attendance records.',
    requiredHeaders: ['schoolCode', 'attendanceRate'],
    optionalHeaders: ['absenceCount', 'status', 'notes', 'period'],
    headerAliases: attendanceAliases,
  },
  housing: {
    key: 'housing',
    label: 'Housing',
    description: 'Housing/accommodation issue summaries mapped into StaffModuleEntry housing records.',
    requiredHeaders: ['schoolCode'],
    optionalHeaders: ['housingIssueCount', 'housingCategory', 'housingSeverity', 'status', 'notes', 'period'],
    headerAliases: housingAliases,
  },
  complaints: {
    key: 'complaints',
    label: 'Complaints',
    description: 'Parent complaints imported into the Complaint table.',
    requiredHeaders: ['schoolCode', 'source', 'title', 'description'],
    optionalHeaders: ['priority', 'status', 'assignedTo', 'resolutionNote'],
    headerAliases: complaintsAliases,
  },
  tasks: {
    key: 'tasks',
    label: 'Tasks',
    description: 'Operational tasks imported into the Task table.',
    requiredHeaders: ['schoolCode', 'title'],
    optionalHeaders: ['description', 'priority', 'status', 'dueDate', 'assignedTo'],
    headerAliases: tasksAliases,
  },
  meetings: {
    key: 'meetings',
    label: 'Meetings',
    description: 'Meetings imported into the Meeting table.',
    requiredHeaders: ['title', 'date'],
    optionalHeaders: ['location', 'schoolCodes', 'participants', 'agenda', 'status', 'notes'],
    headerAliases: meetingsAliases,
  },
  staff_modules: {
    key: 'staff_modules',
    label: 'Staff Modules',
    description: 'Generic staff module rows mapped into StaffModuleEntry records using metrics JSON.',
    requiredHeaders: ['schoolCode', 'title'],
    optionalHeaders: ['status', 'notes', 'attendanceRate', 'absenceCount', 'housingIssueCount', 'housingCategory', 'housingSeverity', 'resolutionSla', 'metricsJson', 'moduleName', 'period'],
    headerAliases: staffAliases,
  },
  schools: {
    key: 'schools',
    label: 'Schools',
    description: 'School master records imported into School.',
    requiredHeaders: ['name', 'code'],
    optionalHeaders: ['isActive'],
    headerAliases: schoolsAliases,
  },
  kpi_snapshots: {
    key: 'kpi_snapshots',
    label: 'KPI Snapshots',
    description: 'Staff/turnover KPI rows imported into KpiSnapshot.',
    requiredHeaders: ['metricName', 'value'],
    optionalHeaders: ['schoolCode', 'date'],
    headerAliases: kpiAliases,
  },
};

