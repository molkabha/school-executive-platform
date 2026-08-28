import * as XLSX from 'xlsx';
import { ParsedFile, NormalizedRow } from './types';

export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;

export function assertImportFileWithinLimit(size: number): void {
  if (size > MAX_IMPORT_BYTES) {
    const limitMb = Math.round(MAX_IMPORT_BYTES / (1024 * 1024));
    throw new Error(`Import file exceeds the maximum allowed size of ${limitMb} MB.`);
  }
}

export function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function cleanCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value).trim();
}

export function buildHeaderLookup(headers: string[], aliases: Record<string, string[]>): Record<string, string> {
  const normalizedToOriginal = new Map<string, string>();
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (normalized) normalizedToOriginal.set(normalized, header);
  }

  const mapping: Record<string, string> = {};
  for (const [canonical, candidates] of Object.entries(aliases)) {
    for (const candidate of candidates) {
      const original = normalizedToOriginal.get(normalizeHeader(candidate));
      if (original) {
        mapping[canonical] = original;
        break;
      }
    }
  }
  return mapping;
}

export function normalizeRows(parsed: ParsedFile, mapping: Record<string, string>): NormalizedRow[] {
  return parsed.rows.map((row, index) => {
    const normalized: Record<string, string> = {};
    for (const [canonical, header] of Object.entries(mapping)) {
      normalized[canonical] = cleanCellValue(row[header]);
    }
    return {
      rowNumber: index + 2,
      raw: row,
      normalized,
    };
  });
}

function parseCsvText(text: string): ParsedFile {
  const rows: string[][] = [];
  let currentCell = '';
  let currentRow: string[] = [];
  let inQuotes = false;

  const pushCell = () => {
    currentRow.push(currentCell);
    currentCell = '';
  };

  const pushRow = () => {
    rows.push(currentRow);
    currentRow = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' ) {
      if (inQuotes && next === '"') {
        currentCell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (char === ',' || char === ';' || char === '\t')) {
      pushCell();
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      pushCell();
      if (currentRow.some((cell) => cell.trim().length > 0) || currentCell.trim().length > 0) {
        pushRow();
      } else if (rows.length === 0) {
        pushRow();
      }
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    pushCell();
    pushRow();
  }

  const [headerRow, ...dataRows] = rows.filter((row) => row.length > 0);
  if (!headerRow || headerRow.length === 0) {
    throw new Error('The file is empty or does not contain a header row.');
  }

  const headers = headerRow.map((header) => header.trim());
  const parsedRows = dataRows.map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] ?? '';
    });
    return obj;
  });

  return {
    fileName: 'upload.csv',
    mimeType: 'text/csv',
    size: Buffer.byteLength(text, 'utf8'),
    headers,
    rows: parsedRows,
  };
}

export function parseDelimitedText(text: string, fileName: string, mimeType: string | null = null): ParsedFile {
  const parsed = parseCsvText(text);
  return { ...parsed, fileName, mimeType };
}

export function parseWorkbook(buffer: Buffer, fileName: string, mimeType: string | null = null): ParsedFile {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, dense: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('The workbook does not contain any worksheets.');
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
    blankrows: false,
  });

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  if (headers.length === 0) {
    throw new Error('The workbook does not contain a header row.');
  }

  return {
    fileName,
    mimeType,
    size: buffer.byteLength,
    headers,
    rows,
  };
}

export function parseImportFile(input: { buffer: Buffer; fileName: string; mimeType: string | null }): ParsedFile {
  assertImportFileWithinLimit(input.buffer.byteLength);

  const lowerName = input.fileName.toLowerCase();
  if (lowerName.endsWith('.csv') || input.mimeType === 'text/csv') {
    return parseDelimitedText(input.buffer.toString('utf8'), input.fileName, input.mimeType);
  }

  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || input.mimeType?.includes('spreadsheet')) {
    return parseWorkbook(input.buffer, input.fileName, input.mimeType);
  }

  throw new Error('Unsupported file type. Only .xlsx and .csv are supported.');
}
