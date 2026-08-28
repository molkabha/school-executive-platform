import { z, ZodSchema } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { SOURCE_TYPE_VALUES } from '../constants/sourceTypes';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({ message: 'Validation failed', errors });
    }
    req.body = result.data;
    next();
  };
}

// ---- Shared Schemas ----

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

// NOTE: connectionConfig here is only shape-checked as a generic record;
// the byte-for-byte, per-type validation (A5) happens in the route via
// connectionConfigSchemaForType(type), which is the single source of truth
// for what each source type's connectionConfig may contain. Keeping this
// bounded (rather than z.any()) still rejects grossly oversized/garbage
// payloads before they reach that stricter, type-aware check.
export const createSourceSchema = z.object({
  name: z.string().min(1, 'Source name is required'),
  type: z.enum(SOURCE_TYPE_VALUES as [string, ...string[]]),
  provider: z.string().min(1, 'Provider is required'),
  module: z.string().min(1, 'Module is required'),
  connectionConfig: z.record(
    z.string().max(100),
    z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]),
  ).refine((obj) => Object.keys(obj).length <= 30, {
    message: 'connectionConfig has too many fields',
  }).optional(),
  externalFileId: z.string().optional(),
  externalUrl: z.string().url().optional().or(z.literal('')),
  schoolId: z.string().optional(),
});

export const createDocumentSchema = z.object({
  name: z.string().min(1, 'Document name is required'),
  sourceType: z.enum(SOURCE_TYPE_VALUES as [string, ...string[]]),
  externalUrl: z.string().optional(),
  module: z.string().min(1, 'Module is required'),
  metadata: z.record(z.string(), z.any()).optional(),
  schoolId: z.string().optional(),
});

export const createReportSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  scope: z.enum(['ALL_SCHOOLS', 'SCHOOL_SPECIFIC']),
  period: z.enum(['WEEKLY', 'MONTHLY', 'SEMESTER']),
  modules: z.array(z.string()).min(1, 'At least one module is required'),
  schoolId: z.string().optional(),
  aiOutput: z.record(z.string(), z.any()).optional(),
});

// Shared base for the two AI-driven report request shapes below — they only
// differ in whether `title` is required (see C6 cleanup).
const baseAIReportSchema = z.object({
  scope: z.enum(['ALL_SCHOOLS', 'SCHOOL_SPECIFIC']),
  period: z.enum(['WEEKLY', 'MONTHLY', 'SEMESTER']),
  modules: z.array(z.string()).min(1),
  schoolId: z.string().optional(),
  contextData: z.string().max(10000).optional(), // extra context passed by client
});

export const generateReportSchema = baseAIReportSchema.extend({
  title: z.string().min(1),
});

export const aiReportSchema = baseAIReportSchema.extend({
  title: z.string().min(1).optional(),
});

export const analyzeSchema = z.object({
  documentType: z.enum(['excel', 'pdf', 'word', 'email', 'text']),
  module: z.string().min(1),
  summaryType: z.enum(['executive', 'detailed', 'risks', 'recommendations']),
  text: z.string().min(1, 'Document text content is required').max(50000, 'Text content must not exceed 50 000 characters'),
  documentName: z.string().optional(),
});

export const createAlertSchema = z.object({
  type: z.enum(['ATTENDANCE', 'HOUSING', 'TURNOVER', 'TEACHER_VOICE', 'SYSTEM', 'DOCUMENT']),
  source: z.string().min(1),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  title: z.string().min(1),
  details: z.string().optional(),
  schoolId: z.string().optional(),
});

export const ALLOWED_CONFIG_KEYS = [
  'ai_provider',
  'ai_model',
  'ai_api_key',
  'ai_base_url',
] as const;
export type AllowedConfigKey = typeof ALLOWED_CONFIG_KEYS[number];

export const configValueSchema = z.object({
  value: z.string(),
});

export const bulkConfigSchema = z.object({
  updates: z.array(z.object({
    key: z.enum(ALLOWED_CONFIG_KEYS),
    value: z.string().max(10000),
  })).min(1).max(50),
});

export const createSchoolSchema = z.object({
  name: z.string().min(1, 'School name is required'),
  code: z.string().min(1, 'School code is required'),
});

export const bulkCreateSchoolSchema = z.object({
  schools: z.array(createSchoolSchema).min(1, 'At least one school is required'),
});

// ---- Staff Module Entry (A3) ----

export const staffEntrySchema = z.object({
  schoolId: z.string().min(1, 'schoolId is required').max(100),
  title: z.string().min(1, 'title is required').max(200),
  // Maps to the `notes` column on StaffModuleEntry (the schema has no separate
  // `description` field — kept as `notes` to avoid changing DB behavior).
  notes: z.string().max(5000).optional(),
  status: z.enum(['ACTIVE', 'NEEDS_ATTENTION', 'CRITICAL', 'GOOD']).optional(),
  metrics: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  linkedDocument: z.string().max(200).optional(),
  sourceRefs: z.array(z.string().max(200)).max(50).optional(),
  attendanceRate: z.number().min(0).max(100).optional(),
  absenceCount: z.number().int().min(0).optional(),
  housingIssueCount: z.number().int().min(0).optional(),
  housingCategory: z.string().max(200).optional(),
  housingSeverity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  resolutionSla: z.string().max(100).optional(),
});

// ---- Agent Chat (A4) ----

const agentHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1).max(8000),
});

export const agentChatSchema = z.object({
  message: z.string().min(1, 'رسالة الاستعلام مطلوبة.').max(4000),
  history: z.array(agentHistoryMessageSchema).max(30).optional(),
  schoolId: z.string().optional(),
});

// ---- Source Connection Config (A5) ----

// connectionConfig shape depends on the source type. Keep each shape
// permissive on unknown extra fields (`.passthrough()`-free but optional
// string/url fields) so existing connected sources continue to work, while
// rejecting arbitrary large/garbage payloads.
const oauthConnectionConfigSchema = z.object({
  accountEmail: z.string().email().optional(),
  folderId: z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Invalid folder ID format').max(200).optional(),
  folderName: z.string().max(300).optional(),
  siteId: z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Invalid site ID format').max(200).optional(),
  driveId: z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Invalid drive ID format').max(200).optional(),
  itemId: z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Invalid item ID format').max(200).optional(),
  scope: z.string().max(300).optional(),
  fileId: z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Invalid file ID format').max(200).optional(),
  externalUrl: z.string().url().optional().or(z.literal('')),
  sourceKind: z.string().max(100).optional(),
  liveTested: z.boolean().optional(),
  label: z.string().max(300).optional(),
  sender: z.string().max(300).optional(),
  subject: z.string().max(300).optional(),
  dateFrom: z.string().max(50).optional(),
  dateTo: z.string().max(50).optional(),
  attachmentOnly: z.boolean().optional(),
  attachmentTypes: z.string().max(100).optional(),
}).partial();

const excelUploadConnectionConfigSchema = z.object({
  fileName: z.string().max(300).optional(),
  fileId: z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Invalid file ID format').max(200).optional(),
  sheetName: z.string().max(300).optional(),
}).partial();

const genericConnectionConfigSchema = z.record(
  z.string().max(100),
  z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]),
).refine((obj) => Object.keys(obj).length <= 30, {
  message: 'connectionConfig has too many fields',
});

export function connectionConfigSchemaForType(type?: string) {
  switch (type) {
    case 'GOOGLE_DRIVE':
    case 'GMAIL':
    case 'ONEDRIVE':
    case 'SHAREPOINT':
    case 'OUTLOOK':
    case 'GOOGLE_SHEETS':
      return oauthConnectionConfigSchema;
    case 'EXCEL_UPLOAD':
      return excelUploadConnectionConfigSchema;
    case 'POWERPOINT':
    case 'WORD':
    case 'PDF_DOC':
    case 'ONENOTE':
      return genericConnectionConfigSchema;
    default:
      return genericConnectionConfigSchema;
  }
}

// ---- Complaint Schemas ----

export const createComplaintSchema = z.object({
  schoolId: z.string().min(1),
  source: z.enum(['WHATSAPP', 'PHONE', 'EMAIL', 'WALK_IN', 'OTHER']),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(3000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  assignedTo: z.string().max(100).optional(),
});

export const updateComplaintSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  assignedTo: z.string().max(100).optional(),
  resolutionNote: z.string().max(2000).optional(),
});

// ---- Task Schemas ----

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  schoolId: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  dueDate: z.string().datetime().optional(),
  assignedTo: z.string().max(100).optional(),
});

export const updateTaskSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  dueDate: z.string().datetime().optional(),
  assignedTo: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
});

// ---- Meeting Schemas ----

export const createMeetingSchema = z.object({
  title: z.string().min(1).max(200),
  date: z.string().datetime(),
  location: z.string().max(200).optional(),
  schoolIds: z.array(z.string()).optional().default([]),
  participants: z.string().max(500).optional(),
  agenda: z.string().max(3000).optional(),
});

export const updateMeetingSchema = z.object({
  status: z.enum(['SCHEDULED', 'DONE', 'CANCELLED']).optional(),
  notes: z.string().max(3000).optional(),
  date: z.string().datetime().optional(),
  location: z.string().max(200).optional(),
  participants: z.string().max(500).optional(),
  agenda: z.string().max(3000).optional(),
  title: z.string().min(1).max(200).optional(),
});
