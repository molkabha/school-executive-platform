import { Prisma, PrismaClient } from '@prisma/client';
import { buildHeaderLookup, normalizeRows, normalizeHeader, parseImportFile } from './parser';
import { DATASET_DEFINITIONS, DatasetDefinition } from './datasets';
import { ImportContext, ImportExecutionResult, ImportRowError, PreviewResult, DatasetType, ImportSourceRef, ParsedFile } from './types';

type DbClient = PrismaClient | Prisma.TransactionClient;

const ATTENDANCE_THRESHOLD = 85;
const KEY_FIELDS = ['schoolCode', 'title', 'metricName', 'date', 'period'];

function hasText(value: string | undefined): boolean {
  return value !== undefined && value !== null && value.trim().length > 0;
}

function buildNaturalKey(row: ReturnType<typeof normalizeRows>[number]): string {
  return Object.entries(row.normalized)
    .filter(([key]) => KEY_FIELDS.includes(key))
    .map(([, value]) => value)
    .filter(Boolean)
    .join('::');
}

function toFiniteNumber(value: string | undefined): number | null {
  if (value === undefined || value === null || value.trim() === '') return null;
  const cleaned = value.replace(/%$/, '').trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value: string | undefined): number | null {
  const number = toFiniteNumber(value);
  if (number === null) return null;
  return Math.trunc(number);
}

function toBoolean(value: string | undefined): boolean | null {
  if (value === undefined || value === null || value.trim() === '') return null;
  const normalized = value.trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'active', 'enabled'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0', 'inactive', 'disabled'].includes(normalized)) return false;
  return null;
}

function toDate(value: string | undefined): Date | null {
  if (!value || value.trim() === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function trimOrNull(value: string | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateNumberField(value: string | undefined, fieldName: string): string | null {
  if (!hasText(value)) return null;
  const cleaned = value!.replace(/%$/, '').trim();
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    return `${fieldName} must be a valid number.`;
  }
  return null;
}

function validateDateField(value: string | undefined, fieldName: string): string | null {
  if (!hasText(value)) return null;
  const parsed = new Date(value!);
  if (Number.isNaN(parsed.getTime())) {
    return `${fieldName} must be a valid date.`;
  }
  return null;
}

function validateBooleanField(value: string | undefined, fieldName: string): string | null {
  if (!hasText(value)) return null;
  if (toBoolean(value) === null) {
    return `${fieldName} must be a valid boolean value.`;
  }
  return null;
}

async function validateRowForDataset(
  db: DbClient,
  datasetType: DatasetType,
  row: ReturnType<typeof normalizeRows>[number],
  source: ImportSourceRef | null,
): Promise<ImportRowError[]> {
  const errors: ImportRowError[] = [];
  const push = (reason: string, column?: string) => {
    errors.push({ rowNumber: row.rowNumber, column, reason });
  };

  const schoolCode = trimOrNull(row.normalized.schoolCode);

  switch (datasetType) {
    case 'schools': {
      const name = trimOrNull(row.normalized.name);
      const code = trimOrNull(row.normalized.code);
      if (!name || !code) {
        push('name and code are required.');
      }
      const isActiveError = validateBooleanField(row.normalized.isActive, 'isActive');
      if (isActiveError) {
        push(isActiveError, 'isActive');
      }
      break;
    }
    case 'attendance':
    case 'housing':
    case 'staff_modules': {
      if (!schoolCode) {
        push('schoolCode is required.', 'schoolCode');
        break;
      }

      const school = await resolveSchoolByCode(db, schoolCode);
      if (source?.schoolId && source.schoolId !== school.id) {
        push(`School code ${schoolCode} is not authorized for this source.`, 'schoolCode');
      }

      const moduleName = source?.module && source.module !== 'general' ? source.module : datasetType;
      if (datasetType === 'attendance' && !hasText(row.normalized.attendanceRate)) {
        push('attendanceRate is required.', 'attendanceRate');
      }

      const attendanceRateError = validateNumberField(row.normalized.attendanceRate, 'attendanceRate');
      if (attendanceRateError) push(attendanceRateError, 'attendanceRate');

      const absenceCountError = validateNumberField(row.normalized.absenceCount, 'absenceCount');
      if (absenceCountError) push(absenceCountError, 'absenceCount');

      const housingIssueCountError = validateNumberField(row.normalized.housingIssueCount, 'housingIssueCount');
      if (housingIssueCountError) push(housingIssueCountError, 'housingIssueCount');

      if (moduleName === 'attendance' && hasText(row.normalized.attendanceRate)) {
        const parsed = Number(row.normalized.attendanceRate.replace(/%$/, '').trim());
        if (Number.isFinite(parsed) && (parsed < 0 || parsed > 100)) {
          push('attendanceRate must be between 0 and 100.', 'attendanceRate');
        }
      }

      if (datasetType === 'staff_modules' && hasText(row.normalized.metricsJson)) {
        try {
          JSON.parse(row.normalized.metricsJson!);
        } catch {
          push('metricsJson must be valid JSON.', 'metricsJson');
        }
      }
      break;
    }
    case 'complaints': {
      if (!schoolCode) {
        push('schoolCode is required.', 'schoolCode');
        break;
      }
      const school = await resolveSchoolByCode(db, schoolCode);
      if (source?.schoolId && source.schoolId !== school.id) {
        push(`School code ${schoolCode} is not authorized for this source.`, 'schoolCode');
      }

      if (!trimOrNull(row.normalized.title) || !trimOrNull(row.normalized.description)) {
        push('title and description are required.');
      }
      break;
    }
    case 'tasks': {
      if (!schoolCode) {
        push('schoolCode is required.', 'schoolCode');
        break;
      }
      const school = await resolveSchoolByCode(db, schoolCode);
      if (source?.schoolId && source.schoolId !== school.id) {
        push(`School code ${schoolCode} is not authorized for this source.`, 'schoolCode');
      }
      if (!trimOrNull(row.normalized.title)) {
        push('title is required.', 'title');
      }
      const dueDateError = validateDateField(row.normalized.dueDate, 'dueDate');
      if (dueDateError) push(dueDateError, 'dueDate');
      break;
    }
    case 'meetings': {
      if (!trimOrNull(row.normalized.title) || !trimOrNull(row.normalized.date)) {
        push('title and date are required.');
        break;
      }
      const dateError = validateDateField(row.normalized.date, 'date');
      if (dateError) push(dateError, 'date');

      const schoolCodes = (trimOrNull(row.normalized.schoolCodes) || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const schools = schoolCodes.length > 0
        ? await Promise.all(schoolCodes.map((code) => resolveSchoolByCode(db, code)))
        : source?.schoolId ? [await db.school.findUniqueOrThrow({ where: { id: source.schoolId } })] : [];
      const schoolIds = schools.map((school) => school.id);
      if (source?.schoolId && schoolIds.length > 0 && !schoolIds.includes(source.schoolId)) {
        push('Meeting school list does not match the source school scope.', 'schoolCodes');
      }
      break;
    }
    case 'kpi_snapshots': {
      if (!trimOrNull(row.normalized.metricName) || !trimOrNull(row.normalized.value)) {
        push('metricName and value are required.');
      }
      const school = schoolCode ? await resolveSchoolByCode(db, schoolCode) : null;
      if (source?.schoolId && school && source.schoolId !== school.id) {
        push(`School code ${schoolCode} is not authorized for this source.`, 'schoolCode');
      }
      const dateError = validateDateField(row.normalized.date, 'date');
      if (dateError) push(dateError, 'date');
      break;
    }
    default:
      break;
  }

  return errors;
}

async function collectPreviewErrors(
  db: DbClient,
  datasetType: DatasetType,
  rows: ReturnType<typeof normalizeRows>,
  source: ImportSourceRef | null,
): Promise<ImportRowError[]> {
  const errors: ImportRowError[] = [];
  const seenKeys = new Set<string>();

  for (const row of rows) {
    const naturalKey = buildNaturalKey(row);
    if (naturalKey && seenKeys.has(naturalKey)) {
      errors.push({ rowNumber: row.rowNumber, reason: `Duplicate row detected for ${naturalKey}.` });
      continue;
    }
    if (naturalKey) seenKeys.add(naturalKey);

    try {
      const rowErrors = await validateRowForDataset(db, datasetType, row, source);
      errors.push(...rowErrors);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      errors.push({ rowNumber: row.rowNumber, reason });
    }
  }

  return errors;
}

function resolveMapping(parsed: ParsedFile, definition: DatasetDefinition, mappingOverride?: Record<string, string>) {
  const detected = buildHeaderLookup(parsed.headers, definition.headerAliases);
  const effective = { ...detected };

  if (mappingOverride) {
    for (const [canonical, header] of Object.entries(mappingOverride)) {
      const normalizedHeader = parsed.headers.find((candidate) => normalizeHeader(candidate) === normalizeHeader(header));
      if (!normalizedHeader) {
        throw new Error(`Mapping header not found in file: ${header}`);
      }
      effective[canonical] = normalizedHeader;
    }
  }

  const missing = definition.requiredHeaders.filter((key) => !effective[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`);
  }

  return effective;
}

function buildPreview(parsed: ParsedFile, datasetType: DatasetType, mapping?: Record<string, string>): PreviewResult {
  const definition = DATASET_DEFINITIONS[datasetType];
  const mappedHeaders = resolveMapping(parsed, definition, mapping);
  const sampleRows = parsed.rows.slice(0, 5);
  return {
    fileName: parsed.fileName,
    datasetType,
    rowCount: parsed.rows.length,
    headers: parsed.headers,
    mappedHeaders,
    sampleRows,
    errors: [],
  };
}

function normalizeForDataset(parsed: ParsedFile, definition: DatasetDefinition, mapping?: Record<string, string>) {
  const mappedHeaders = resolveMapping(parsed, definition, mapping);
  return {
    mappedHeaders,
    rows: normalizeRows(parsed, mappedHeaders),
  };
}

async function createBatch(prisma: PrismaClient, context: ImportContext, parsed: ParsedFile, preview?: PreviewResult, mapping?: Record<string, string>) {
  return prisma.importBatch.create({
    data: {
      sourceId: context.sourceId || null,
      sourceType: context.sourceType,
      datasetType: context.datasetType,
      fileName: context.fileName,
      fileMimeType: context.mimeType,
      fileSize: parsed.size,
      triggeredById: context.triggeredById,
      schoolId: context.schoolId,
      status: 'PENDING',
      rowCount: parsed.rows.length,
      mapping: JSON.stringify(mapping || preview?.mappedHeaders || {}),
      preview: preview ? JSON.stringify(preview) : null,
      errors: JSON.stringify([]),
      summary: JSON.stringify({}),
    },
  });
}

async function recordBatchFailure(db: DbClient, batchId: string, rowNumber: number, entityType: string, row: Record<string, unknown>, reason: string) {
  await db.importBatchItem.create({
    data: {
      batchId,
      rowNumber,
      entityType,
      action: 'FAIL',
      rawRow: JSON.stringify(row),
      errors: JSON.stringify([{ rowNumber, reason }]),
    },
  });
}

async function upsertSchool(db: DbClient, batchId: string, rowNumber: number, row: ReturnType<typeof normalizeRows>[number], source: ImportSourceRef | null) {
  const code = trimOrNull(row.normalized.code);
  const name = trimOrNull(row.normalized.name);
  if (!code || !name) {
    throw new Error('name and code are required.');
  }

  const isActive = toBoolean(row.normalized.isActive);
  const existing = await db.school.findUnique({ where: { code } });
  const payload = {
    name,
    code,
    isActive: isActive ?? existing?.isActive ?? true,
  };

  if (existing) {
    const updated = await db.school.update({ where: { id: existing.id }, data: payload });
    await db.importBatchItem.create({
      data: {
        batchId,
        rowNumber,
        entityType: 'School',
        entityId: updated.id,
        naturalKey: code,
        action: 'UPDATE',
        schoolId: updated.id,
        beforeState: JSON.stringify(existing),
        afterState: JSON.stringify(updated),
        rawRow: JSON.stringify(row.raw),
      },
    });
    return { action: 'UPDATE' as const, entityId: updated.id };
  }

  const created = await db.school.create({ data: payload });
  await db.importBatchItem.create({
    data: {
      batchId,
      rowNumber,
      entityType: 'School',
      entityId: created.id,
      naturalKey: code,
      action: 'CREATE',
      schoolId: created.id,
      afterState: JSON.stringify(created),
      rawRow: JSON.stringify(row.raw),
    },
  });
  void source;
  return { action: 'CREATE' as const, entityId: created.id };
}

async function resolveSchoolByCode(db: DbClient, schoolCode: string) {
  const school = await db.school.findUnique({ where: { code: schoolCode } });
  if (!school) {
    throw new Error(`Unknown school code: ${schoolCode}`);
  }
  return school;
}

async function upsertStaffEntry(
  db: DbClient,
  batchId: string,
  rowNumber: number,
  row: ReturnType<typeof normalizeRows>[number],
  moduleName: string,
  source: ImportSourceRef | null
) {
  const schoolCode = trimOrNull(row.normalized.schoolCode);
  if (!schoolCode) throw new Error('schoolCode is required.');
  const school = await resolveSchoolByCode(db, schoolCode);

  if (source?.schoolId && source.schoolId !== school.id) {
    throw new Error(`School code ${schoolCode} is not authorized for this source.`);
  }

  const period = trimOrNull(row.normalized.period);
  const status = trimOrNull(row.normalized.status) || (moduleName === 'attendance' ? 'GOOD' : 'ACTIVE');
  const title = trimOrNull(row.normalized.title) || `${moduleName} - ${period || 'Latest'}`;
  const attendanceRate = toFiniteNumber(row.normalized.attendanceRate);
  const absenceCount = toInteger(row.normalized.absenceCount);
  const housingIssueCount = toInteger(row.normalized.housingIssueCount);
  const housingCategory = trimOrNull(row.normalized.housingCategory);
  const housingSeverity = trimOrNull(row.normalized.housingSeverity);
  const resolutionSla = trimOrNull(row.normalized.resolutionSla);
  const notes = trimOrNull(row.normalized.notes);
  const metricsJson = trimOrNull(row.normalized.metricsJson);

  if (moduleName === 'attendance') {
    if (attendanceRate === null) throw new Error('attendanceRate is required.');
    if (attendanceRate < 0 || attendanceRate > 100) {
      throw new Error('attendanceRate must be between 0 and 100.');
    }
  }

  const existing = await db.staffModuleEntry.findFirst({
    where: {
      schoolId: school.id,
      moduleName,
      title,
    },
  });

  const metrics = {
    ...(existing?.metrics ? JSON.parse(existing.metrics) : {}),
    ...(metricsJson ? JSON.parse(metricsJson) : {}),
    sourceSchoolCode: schoolCode,
    reportingPeriod: period || null,
  };

  const data: Prisma.StaffModuleEntryUncheckedCreateInput = {
    moduleName,
    schoolId: school.id,
    title,
    status,
    metrics: JSON.stringify(metrics),
    notes,
    attendanceRate: attendanceRate ?? null,
    absenceCount: absenceCount ?? null,
    housingIssueCount: housingIssueCount ?? null,
    housingCategory,
    housingSeverity,
    resolutionSla,
    linkedDocument: null,
    sourceRefs: JSON.stringify(source ? [source.id] : []),
  };

  if (existing) {
    const updated = await db.staffModuleEntry.update({
      where: { id: existing.id },
      data,
    });
    await db.importBatchItem.create({
      data: {
        batchId,
        rowNumber,
        entityType: 'StaffModuleEntry',
        entityId: updated.id,
        naturalKey: `${school.code}:${moduleName}:${title}`,
        action: 'UPDATE',
        schoolId: school.id,
        beforeState: JSON.stringify(existing),
        afterState: JSON.stringify(updated),
        rawRow: JSON.stringify(row.raw),
      },
    });

    if (moduleName === 'attendance' && attendanceRate !== null && attendanceRate < ATTENDANCE_THRESHOLD) {
      const existingAlert = await db.alert.findFirst({
        where: {
          type: 'ATTENDANCE',
          schoolId: school.id,
          status: { not: 'RESOLVED' },
        },
      });
      if (!existingAlert) {
        await db.alert.create({
          data: {
            type: 'ATTENDANCE',
            source: 'attendance',
            priority: attendanceRate < 70 ? 'CRITICAL' : 'HIGH',
            title: `Attendance below threshold: ${attendanceRate.toFixed(1)}%`,
            details: `Imported attendance rate ${attendanceRate.toFixed(1)}% for ${school.name}.`,
            schoolId: school.id,
            status: 'OPEN',
          },
        });
      }
    }

    return { action: 'UPDATE' as const, entityId: updated.id };
  }

  const created = await db.staffModuleEntry.create({
    data,
  });
  await db.importBatchItem.create({
    data: {
      batchId,
      rowNumber,
      entityType: 'StaffModuleEntry',
      entityId: created.id,
      naturalKey: `${school.code}:${moduleName}:${title}`,
      action: 'CREATE',
      schoolId: school.id,
      afterState: JSON.stringify(created),
      rawRow: JSON.stringify(row.raw),
    },
  });

  if (moduleName === 'attendance' && attendanceRate !== null && attendanceRate < ATTENDANCE_THRESHOLD) {
    const existingAlert = await db.alert.findFirst({
      where: {
        type: 'ATTENDANCE',
        schoolId: school.id,
        status: { not: 'RESOLVED' },
      },
    });
    if (!existingAlert) {
      await db.alert.create({
        data: {
          type: 'ATTENDANCE',
          source: 'attendance',
          priority: attendanceRate < 70 ? 'CRITICAL' : 'HIGH',
          title: `Attendance below threshold: ${attendanceRate.toFixed(1)}%`,
          details: `Imported attendance rate ${attendanceRate.toFixed(1)}% for ${school.name}.`,
          schoolId: school.id,
          status: 'OPEN',
        },
      });
    }
  }

  return { action: 'CREATE' as const, entityId: created.id };
}

async function upsertComplaint(db: DbClient, batchId: string, rowNumber: number, row: ReturnType<typeof normalizeRows>[number], source: ImportSourceRef | null) {
  const schoolCode = trimOrNull(row.normalized.schoolCode);
  const school = await resolveSchoolByCode(db, schoolCode || '');
  if (source?.schoolId && source.schoolId !== school.id) {
    throw new Error(`School code ${schoolCode} is not authorized for this source.`);
  }

  const sourceValue = trimOrNull(row.normalized.source) || 'OTHER';
  const title = trimOrNull(row.normalized.title);
  const description = trimOrNull(row.normalized.description);
  if (!title || !description) throw new Error('title and description are required.');

  const existing = await db.complaint.findFirst({ where: { schoolId: school.id, title, source: sourceValue } });
  const data: Prisma.ComplaintUncheckedCreateInput = {
    schoolId: school.id,
    source: sourceValue,
    title,
    description,
    priority: trimOrNull(row.normalized.priority) || 'MEDIUM',
    status: trimOrNull(row.normalized.status) || 'OPEN',
    assignedTo: trimOrNull(row.normalized.assignedTo),
    resolutionNote: trimOrNull(row.normalized.resolutionNote),
    resolvedAt: trimOrNull(row.normalized.status) === 'RESOLVED' ? new Date() : null,
  };

  if (existing) {
    const updated = await db.complaint.update({ where: { id: existing.id }, data });
    await db.importBatchItem.create({
      data: {
        batchId,
        rowNumber,
        entityType: 'Complaint',
        entityId: updated.id,
        naturalKey: `${school.code}:${sourceValue}:${title}`,
        action: 'UPDATE',
        schoolId: school.id,
        beforeState: JSON.stringify(existing),
        afterState: JSON.stringify(updated),
        rawRow: JSON.stringify(row.raw),
      },
    });
    return { action: 'UPDATE' as const, entityId: updated.id };
  }

  const created = await db.complaint.create({ data });
  await db.importBatchItem.create({
    data: {
      batchId,
      rowNumber,
      entityType: 'Complaint',
      entityId: created.id,
      naturalKey: `${school.code}:${sourceValue}:${title}`,
      action: 'CREATE',
      schoolId: school.id,
      afterState: JSON.stringify(created),
      rawRow: JSON.stringify(row.raw),
    },
  });
  return { action: 'CREATE' as const, entityId: created.id };
}

async function upsertTask(db: DbClient, batchId: string, rowNumber: number, row: ReturnType<typeof normalizeRows>[number], source: ImportSourceRef | null) {
  const schoolCode = trimOrNull(row.normalized.schoolCode);
  const school = await resolveSchoolByCode(db, schoolCode || '');
  if (source?.schoolId && source.schoolId !== school.id) {
    throw new Error(`School code ${schoolCode} is not authorized for this source.`);
  }

  const title = trimOrNull(row.normalized.title);
  if (!title) throw new Error('title is required.');
  const existing = await db.task.findFirst({ where: { schoolId: school.id, title } });
  const dueDate = toDate(row.normalized.dueDate);
  const data: Prisma.TaskUncheckedCreateInput = {
    title,
    description: trimOrNull(row.normalized.description),
    schoolId: school.id,
    priority: trimOrNull(row.normalized.priority) || 'MEDIUM',
    status: trimOrNull(row.normalized.status) || 'OPEN',
    dueDate,
    assignedTo: trimOrNull(row.normalized.assignedTo),
    completedAt: trimOrNull(row.normalized.status) === 'DONE' ? new Date() : null,
  };

  if (existing) {
    const updated = await db.task.update({ where: { id: existing.id }, data });
    await db.importBatchItem.create({
      data: {
        batchId,
        rowNumber,
        entityType: 'Task',
        entityId: updated.id,
        naturalKey: `${school.code}:${title}`,
        action: 'UPDATE',
        schoolId: school.id,
        beforeState: JSON.stringify(existing),
        afterState: JSON.stringify(updated),
        rawRow: JSON.stringify(row.raw),
      },
    });
    return { action: 'UPDATE' as const, entityId: updated.id };
  }

  const created = await db.task.create({ data });
  await db.importBatchItem.create({
    data: {
      batchId,
      rowNumber,
      entityType: 'Task',
      entityId: created.id,
      naturalKey: `${school.code}:${title}`,
      action: 'CREATE',
      schoolId: school.id,
      afterState: JSON.stringify(created),
      rawRow: JSON.stringify(row.raw),
    },
  });
  return { action: 'CREATE' as const, entityId: created.id };
}

async function upsertMeeting(db: DbClient, batchId: string, rowNumber: number, row: ReturnType<typeof normalizeRows>[number], source: ImportSourceRef | null) {
  const title = trimOrNull(row.normalized.title);
  const date = toDate(row.normalized.date);
  if (!title || !date) throw new Error('title and date are required.');

  const schoolCodes = (trimOrNull(row.normalized.schoolCodes) || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const schools = schoolCodes.length > 0
    ? await Promise.all(schoolCodes.map((code) => resolveSchoolByCode(db, code)))
    : source?.schoolId ? [await db.school.findUniqueOrThrow({ where: { id: source.schoolId } })] : [];

  const schoolIds = schools.map((school) => school.id);
  if (source?.schoolId && schoolIds.length > 0 && !schoolIds.includes(source.schoolId)) {
    throw new Error('Meeting school list does not match the source school scope.');
  }

  // NOTE on Meeting: title+date may have legitimate duplicates (e.g. rescheduled meeting with same name).
  // No unique database constraint is added to Meeting; the findFirst+create pattern is intentionally best-effort.
  const existing = await db.meeting.findFirst({ where: { title, date } });
  const data: Prisma.MeetingUncheckedCreateInput = {
    title,
    date,
    location: trimOrNull(row.normalized.location),
    schoolIds: JSON.stringify(schoolIds),
    participants: trimOrNull(row.normalized.participants),
    agenda: trimOrNull(row.normalized.agenda),
    status: trimOrNull(row.normalized.status) || 'SCHEDULED',
    notes: trimOrNull(row.normalized.notes),
  };

  if (existing) {
    const updated = await db.meeting.update({ where: { id: existing.id }, data });
    await db.importBatchItem.create({
      data: {
        batchId,
        rowNumber,
        entityType: 'Meeting',
        entityId: updated.id,
        naturalKey: `${title}:${date.toISOString()}`,
        action: 'UPDATE',
        schoolId: schoolIds[0] || null,
        beforeState: JSON.stringify(existing),
        afterState: JSON.stringify(updated),
        rawRow: JSON.stringify(row.raw),
      },
    });
    return { action: 'UPDATE' as const, entityId: updated.id };
  }

  const created = await db.meeting.create({ data });
  await db.importBatchItem.create({
    data: {
      batchId,
      rowNumber,
      entityType: 'Meeting',
      entityId: created.id,
      naturalKey: `${title}:${date.toISOString()}`,
      action: 'CREATE',
      schoolId: schoolIds[0] || null,
      afterState: JSON.stringify(created),
      rawRow: JSON.stringify(row.raw),
    },
  });
  return { action: 'CREATE' as const, entityId: created.id };
}

async function upsertKpiSnapshot(db: DbClient, batchId: string, rowNumber: number, row: ReturnType<typeof normalizeRows>[number], source: ImportSourceRef | null) {
  const metricName = trimOrNull(row.normalized.metricName);
  const value = trimOrNull(row.normalized.value);
  if (!metricName || !value) throw new Error('metricName and value are required.');
  const date = toDate(row.normalized.date) || new Date();
  const schoolCode = trimOrNull(row.normalized.schoolCode);
  const school = schoolCode ? await resolveSchoolByCode(db, schoolCode) : null;
  if (source?.schoolId && school && source.schoolId !== school.id) {
    throw new Error(`School code ${schoolCode} is not authorized for this source.`);
  }

  const existing = await db.kpiSnapshot.findFirst({
    where: {
      metricName,
      schoolId: school?.id || null,
      date,
    },
  });

  const data: Prisma.KpiSnapshotUncheckedCreateInput = {
    metricName,
    value,
    schoolId: school?.id || null,
    date,
  };

  if (existing) {
    const updated = await db.kpiSnapshot.update({ where: { id: existing.id }, data });
    await db.importBatchItem.create({
      data: {
        batchId,
        rowNumber,
        entityType: 'KpiSnapshot',
        entityId: updated.id,
        naturalKey: `${metricName}:${school?.code || 'all'}:${date.toISOString()}`,
        action: 'UPDATE',
        schoolId: school?.id || null,
        beforeState: JSON.stringify(existing),
        afterState: JSON.stringify(updated),
        rawRow: JSON.stringify(row.raw),
      },
    });
    return { action: 'UPDATE' as const, entityId: updated.id };
  }

  const created = await db.kpiSnapshot.create({ data });
  await db.importBatchItem.create({
    data: {
      batchId,
      rowNumber,
      entityType: 'KpiSnapshot',
      entityId: created.id,
      naturalKey: `${metricName}:${school?.code || 'all'}:${date.toISOString()}`,
      action: 'CREATE',
      schoolId: school?.id || null,
      afterState: JSON.stringify(created),
      rawRow: JSON.stringify(row.raw),
    },
  });
  return { action: 'CREATE' as const, entityId: created.id };
}

async function processRow(
  prisma: PrismaClient,
  batchId: string,
  row: ReturnType<typeof normalizeRows>[number],
  datasetType: DatasetType,
  source: ImportSourceRef | null,
) {
  const moduleName = source?.module && source.module !== 'general' ? source.module : datasetType;
  return prisma.$transaction(async (tx) => {
    switch (datasetType) {
      case 'schools':
        return upsertSchool(tx, batchId, row.rowNumber, row, source);
      case 'attendance':
      case 'housing':
      case 'staff_modules':
        return upsertStaffEntry(tx, batchId, row.rowNumber, row, moduleName || datasetType, source);
      case 'complaints':
        return upsertComplaint(tx, batchId, row.rowNumber, row, source);
      case 'tasks':
        return upsertTask(tx, batchId, row.rowNumber, row, source);
      case 'meetings':
        return upsertMeeting(tx, batchId, row.rowNumber, row, source);
      case 'kpi_snapshots':
        return upsertKpiSnapshot(tx, batchId, row.rowNumber, row, source);
      default:
        throw new Error(`Unsupported dataset type: ${datasetType}`);
    }
  });
}

export async function previewImportFile(
  db: DbClient,
  buffer: Buffer,
  fileName: string,
  mimeType: string | null,
  datasetType: DatasetType,
  mapping?: Record<string, string>,
  source: ImportSourceRef | null = null,
): Promise<PreviewResult> {
  const parsed = parseImportFile({ buffer, fileName, mimeType });
  const definition = DATASET_DEFINITIONS[datasetType];
  const { mappedHeaders, rows } = normalizeForDataset(parsed, definition, mapping);
  const preview = buildPreview(parsed, datasetType, mapping);
  const errors = await collectPreviewErrors(db, datasetType, rows, source);
  return {
    ...preview,
    errors,
    mappedHeaders,
  };
}

export async function importParsedFile(
  prisma: PrismaClient,
  context: ImportContext,
  buffer: Buffer,
  mapping?: Record<string, string>,
  source?: ImportSourceRef | null,
): Promise<ImportExecutionResult> {
  const parsed = parseImportFile({ buffer, fileName: context.fileName, mimeType: context.mimeType });
  const definition = DATASET_DEFINITIONS[context.datasetType];
  const { mappedHeaders, rows } = normalizeForDataset(parsed, definition, mapping);
  const batch = await createBatch(prisma, context, parsed, { ...buildPreview(parsed, context.datasetType, mapping), mappedHeaders }, mappedHeaders);

  const errors: ImportRowError[] = [];
  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const seenKeys = new Set<string>();
  for (const row of rows) {
    const naturalKey = buildNaturalKey(row);

    if (naturalKey && seenKeys.has(naturalKey)) {
      skippedCount += 1;
      errors.push({ rowNumber: row.rowNumber, reason: `Duplicate row detected for ${naturalKey}.` });
      await recordBatchFailure(prisma, batch.id, row.rowNumber, context.datasetType, row.raw, `Duplicate row detected for ${naturalKey}.`);
      continue;
    }
    if (naturalKey) seenKeys.add(naturalKey);

    try {
      const validationErrors = await validateRowForDataset(prisma, context.datasetType, row, source || null);
      if (validationErrors.length > 0) {
        failedCount += 1;
        errors.push(...validationErrors);
        await recordBatchFailure(
          prisma,
          batch.id,
          row.rowNumber,
          context.datasetType,
          row.raw,
          validationErrors.map((item) => item.reason).join(' '),
        );
        continue;
      }

      const result = await processRow(prisma, batch.id, row, context.datasetType, source || null);
      if (result.action === 'CREATE') importedCount += 1;
      else if (result.action === 'UPDATE') updatedCount += 1;
      else skippedCount += 1;
    } catch (error) {
      failedCount += 1;
      const reason = error instanceof Error ? error.message : String(error);
      errors.push({ rowNumber: row.rowNumber, reason });
      await recordBatchFailure(prisma, batch.id, row.rowNumber, context.datasetType, row.raw, reason);
    }
  }

  const status = failedCount > 0
    ? (importedCount > 0 || updatedCount > 0 ? 'PARTIAL' : 'FAILED')
    : 'COMPLETED';

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status,
      importedCount,
      updatedCount,
      skippedCount,
      failedCount,
      errors: JSON.stringify(errors),
      summary: JSON.stringify({
        importedCount,
        updatedCount,
        skippedCount,
        failedCount,
        rowCount: rows.length,
      }),
    },
  });

  return {
    batchId: batch.id,
    rowCount: rows.length,
    status,
    importedCount,
    updatedCount,
    skippedCount,
    failedCount,
    errors,
  };
}

export async function rollbackImportBatch(prisma: PrismaClient, batchId: string, rolledBackById: string) {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    include: { items: true },
  });
  if (!batch) {
    throw new Error('Import batch not found.');
  }

  const orderedItems = [...batch.items].sort((a, b) => b.rowNumber - a.rowNumber);
  for (const item of orderedItems) {
    if (!item.entityId || item.action === 'FAIL' || item.action === 'SKIP') {
      continue;
    }

    if (item.action === 'CREATE') {
      await deleteImportedEntity(prisma, item.entityType, item.entityId);
      continue;
    }

    if (item.action === 'UPDATE' && item.beforeState) {
      await restoreImportedEntity(prisma, item.entityType, item.entityId, JSON.parse(item.beforeState));
    }
  }

  const updated = await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: 'ROLLED_BACK',
      rolledBackAt: new Date(),
      rolledBackById,
    },
  });

  return updated;
}

async function deleteImportedEntity(prisma: PrismaClient, entityType: string, entityId: string) {
  switch (entityType) {
    case 'School':
      await prisma.school.delete({ where: { id: entityId } });
      break;
    case 'StaffModuleEntry':
      await prisma.staffModuleEntry.delete({ where: { id: entityId } });
      break;
    case 'Complaint':
      await prisma.complaint.delete({ where: { id: entityId } });
      break;
    case 'Task':
      await prisma.task.delete({ where: { id: entityId } });
      break;
    case 'Meeting':
      await prisma.meeting.delete({ where: { id: entityId } });
      break;
    case 'KpiSnapshot':
      await prisma.kpiSnapshot.delete({ where: { id: entityId } });
      break;
    case 'Alert':
      await prisma.alert.delete({ where: { id: entityId } });
      break;
    default:
      throw new Error(`Unsupported entity type for rollback: ${entityType}`);
  }
}

async function restoreImportedEntity(prisma: PrismaClient, entityType: string, entityId: string, beforeState: any) {
  switch (entityType) {
    case 'School': {
      const { name, code, isActive } = beforeState;
      await prisma.school.update({ where: { id: entityId }, data: { name, code, isActive } });
      break;
    }
    case 'StaffModuleEntry': {
      const { moduleName, schoolId, title, status, metrics, notes, attendanceRate, absenceCount,
        housingIssueCount, housingCategory, housingSeverity, resolutionSla, linkedDocument, sourceRefs } = beforeState;
      await prisma.staffModuleEntry.update({
        where: { id: entityId },
        data: { moduleName, schoolId, title, status, metrics, notes, attendanceRate, absenceCount,
          housingIssueCount, housingCategory, housingSeverity, resolutionSla, linkedDocument, sourceRefs },
      });
      break;
    }
    case 'Complaint': {
      const { schoolId, source, title, description, priority, status, assignedTo, resolvedAt, resolutionNote } = beforeState;
      await prisma.complaint.update({
        where: { id: entityId },
        data: { schoolId, source, title, description, priority, status, assignedTo, resolvedAt, resolutionNote },
      });
      break;
    }
    case 'Task': {
      const { title, description, schoolId, priority, status, dueDate, assignedTo, completedAt } = beforeState;
      await prisma.task.update({
        where: { id: entityId },
        data: { title, description, schoolId, priority, status, dueDate, assignedTo, completedAt },
      });
      break;
    }
    case 'Meeting': {
      const { title, date, location, schoolIds, participants, agenda, status, notes } = beforeState;
      await prisma.meeting.update({
        where: { id: entityId },
        data: { title, date, location, schoolIds, participants, agenda, status, notes },
      });
      break;
    }
    case 'KpiSnapshot': {
      const { metricName, value, schoolId, date } = beforeState;
      await prisma.kpiSnapshot.update({ where: { id: entityId }, data: { metricName, value, schoolId, date } });
      break;
    }
    case 'Alert': {
      const { type, source, status, priority, title, details, schoolId, resolvedAt } = beforeState;
      await prisma.alert.update({
        where: { id: entityId },
        data: { type, source, status, priority, title, details, schoolId, resolvedAt },
      });
      break;
    }
    default:
      throw new Error(`Unsupported entity type for rollback: ${entityType}`);
  }
}

