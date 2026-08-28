export type DatasetType =
  | 'attendance'
  | 'housing'
  | 'complaints'
  | 'tasks'
  | 'meetings'
  | 'staff_modules'
  | 'schools'
  | 'kpi_snapshots';

export type ImportAction = 'CREATE' | 'UPDATE' | 'SKIP' | 'FAIL';

export interface ImportRowError {
  rowNumber: number;
  column?: string;
  reason: string;
}

export interface ParsedFile {
  fileName: string;
  mimeType: string | null;
  size: number;
  headers: string[];
  rows: Array<Record<string, unknown>>;
}

export interface NormalizedRow {
  rowNumber: number;
  raw: Record<string, unknown>;
  normalized: Record<string, string>;
}

export interface PreviewResult {
  fileName: string;
  datasetType: DatasetType;
  rowCount: number;
  headers: string[];
  mappedHeaders: Record<string, string>;
  sampleRows: Array<Record<string, unknown>>;
  errors: ImportRowError[];
}

export interface ImportStats {
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
}

export interface ImportExecutionResult extends ImportStats {
  batchId: string;
  rowCount: number;
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
  errors: ImportRowError[];
}

export interface ImportContext {
  datasetType: DatasetType;
  fileName: string;
  mimeType: string | null;
  sourceId: string | null;
  sourceType: string;
  schoolId: string | null;
  triggeredById: string;
}

export interface ImportSourceRef {
  id: string;
  name: string;
  type: string;
  module: string;
  externalFileId?: string | null;
  externalUrl?: string | null;
  connectionConfig?: string | null;
  schoolId?: string | null;
}
