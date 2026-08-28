import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { extractDriveId, downloadGoogleDriveFile } from '../src/imports/googleDrive';
import { importParsedFile, previewImportFile, rollbackImportBatch } from '../src/imports/engine';
import { MAX_IMPORT_BYTES, parseImportFile } from '../src/imports/parser';

type PlainObject = Record<string, any>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function matchesWhere(row: PlainObject, where: PlainObject | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('not' in expected) return actual !== expected.not;
      if ('in' in expected) return Array.isArray(expected.in) && expected.in.includes(actual);
      if ('gte' in expected) return actual >= expected.gte;
      if ('lte' in expected) return actual <= expected.lte;
      if ('lt' in expected) return actual < expected.lt;
      if ('gt' in expected) return actual > expected.gt;
      return matchesWhere(actual || {}, expected as PlainObject);
    }
    if (actual instanceof Date && expected instanceof Date) {
      return actual.getTime() === expected.getTime();
    }
    return actual === expected;
  });
}

class MemoryModel<T extends PlainObject> {
  private rows = new Map<string, T>();
  constructor(private readonly prefix: string) {}

  private nextId() {
    return `${this.prefix}_${this.rows.size + 1}`;
  }

  private list() {
    return Array.from(this.rows.values());
  }

  findUnique = async ({ where }: { where: PlainObject }) => {
    if ('id' in where) {
      const row = this.rows.get(where.id);
      return row ? clone(row) : null;
    }
    const row = this.list().find((candidate) => matchesWhere(candidate, where));
    return row ? clone(row) : null;
  };

  findFirst = async ({ where }: { where: PlainObject }) => {
    const row = this.list().find((candidate) => matchesWhere(candidate, where));
    return row ? clone(row) : null;
  };

  findMany = async ({ where }: { where?: PlainObject } = {}) => {
    return this.list().filter((candidate) => matchesWhere(candidate, where)).map(clone);
  };

  create = async ({ data }: { data: PlainObject }) => {
    const row = { id: this.nextId(), ...clone(data) } as unknown as T;
    this.rows.set(row.id, row);
    return clone(row);
  };

  update = async ({ where, data }: { where: PlainObject; data: PlainObject }) => {
    const row = await this.findUnique({ where });
    if (!row) throw new Error(`${this.prefix} not found`);
    const merged = { ...row, ...clone(data) } as unknown as T;
    this.rows.set(merged.id, merged);
    return clone(merged);
  };

  delete = async ({ where }: { where: PlainObject }) => {
    const row = await this.findUnique({ where });
    if (!row) throw new Error(`${this.prefix} not found`);
    this.rows.delete(row.id);
    return clone(row);
  };

  upsert = async ({ where, create, update }: { where: PlainObject; create: PlainObject; update: PlainObject }) => {
    const existing = await this.findUnique({ where });
    return existing ? this.update({ where, data: update }) : this.create({ data: create });
  };

  seed(rows: T[]) {
    for (const row of rows) {
      this.rows.set(row.id, clone(row));
    }
  }

  values() {
    return this.list().map(clone);
  }
}

function createMemoryPrisma() {
  const schools = new MemoryModel<PlainObject>('school');
  const staffModuleEntry = new MemoryModel<PlainObject>('staff');
  const complaint = new MemoryModel<PlainObject>('complaint');
  const task = new MemoryModel<PlainObject>('task');
  const meeting = new MemoryModel<PlainObject>('meeting');
  const kpiSnapshot = new MemoryModel<PlainObject>('kpi');
  const alert = new MemoryModel<PlainObject>('alert');
  const importBatch = new MemoryModel<PlainObject>('batch');
  const importBatchItem = new MemoryModel<PlainObject>('batchItem');

  const prisma: any = {
    school: schools,
    staffModuleEntry,
    complaint,
    task,
    meeting,
    kpiSnapshot,
    alert,
    importBatch: {
      ...importBatch,
      create: async ({ data }: { data: PlainObject }) => {
        const row = await importBatch.create({ data });
        (row as any).items = [];
        return row;
      },
      findUnique: async ({ where, include }: { where: PlainObject; include?: PlainObject }) => {
        const row = await importBatch.findUnique({ where });
        if (!row) return null;
        if (include?.items) {
          (row as any).items = importBatchItem.values().filter((item) => item.batchId === row.id);
        }
        return row;
      },
    },
    importBatchItem: {
      ...importBatchItem,
      create: async ({ data }: { data: PlainObject }) => {
        const row = await importBatchItem.create({ data });
        return row;
      },
    },
    $transaction: async (callback: (tx: any) => Promise<any>) => callback(prisma),
  };

  return prisma;
}

async function withMockFetch<T>(response: any, run: () => Promise<T> | T) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => response) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const tests: Array<{ name: string; run: () => Promise<void> | void }> = [];
function test(name: string, run: () => Promise<void> | void) {
  tests.push({ name, run });
}

test('parseImportFile parses CSV headers and rows', () => {
  const parsed = parseImportFile({
    buffer: Buffer.from('name,code\nAlpha,SCH-1\nBeta,SCH-2\n'),
    fileName: 'schools.csv',
    mimeType: 'text/csv',
  });
  assert.equal(parsed.headers.length, 2);
  assert.equal(parsed.rows.length, 2);
  assert.equal(String(parsed.rows[0].name), 'Alpha');
});

test('extractDriveId parses file and folder URLs', () => {
  assert.equal(extractDriveId('https://drive.google.com/file/d/FILE123/view'), 'FILE123');
  assert.equal(extractDriveId('https://drive.google.com/drive/folders/FOLDER123'), 'FOLDER123');
});

test('previewImportFile maps attendance headers', async () => {
  const prisma = createMemoryPrisma();
  await prisma.school.create({ data: { name: 'Alpha', code: 'SCH-1', isActive: true } });
  const preview = await previewImportFile(
    prisma,
    Buffer.from('School Code,Attendance %,Absence Count,Status,Notes,Period\nSCH-1,93,2,GOOD,All good,August\n'),
    'attendance.csv',
    'text/csv',
    'attendance'
  );
  assert.equal(preview.rowCount, 1);
  assert.ok(preview.mappedHeaders.schoolCode);
  assert.ok(preview.mappedHeaders.attendanceRate);
});

test('previewImportFile surfaces attendance validation errors', async () => {
  const prisma = createMemoryPrisma();
  await prisma.school.create({ data: { name: 'Alpha', code: 'SCH-1', isActive: true } });

  const preview = await previewImportFile(
    prisma,
    Buffer.from('School Code,Attendance %,Period\nSCH-1,150,August\nSCH-1,150,August\n'),
    'attendance.csv',
    'text/csv',
    'attendance'
  );

  assert.ok(preview.errors.length > 0);
  assert.match(preview.errors[0].reason, /attendanceRate/);
});

test('importParsedFile imports attendance rows and creates alerts for low values', async () => {
  const prisma = createMemoryPrisma();
  await prisma.school.create({ data: { name: 'Alpha', code: 'SCH-1', isActive: true } });
  await prisma.school.create({ data: { name: 'Beta', code: 'SCH-2', isActive: true } });

  const result = await importParsedFile(
    prisma,
    {
      datasetType: 'attendance',
      fileName: 'attendance.csv',
      mimeType: 'text/csv',
      sourceId: null,
      sourceType: 'GOOGLE_DRIVE',
      schoolId: null,
      triggeredById: 'user_1',
    },
    Buffer.from('School Code,Attendance %,Absence Count,Status,Notes,Period\nSCH-1,93,2,GOOD,Alpha,August\nSCH-2,81,4,NEEDS_ATTENTION,Beta,August\n')
  );

  assert.equal(result.importedCount, 2);
  assert.equal(result.failedCount, 0);
  assert.equal(prisma.staffModuleEntry.values().length, 2);
  assert.equal(prisma.alert.values().length, 1);
});

test('importParsedFile rejects invalid attendance percentage', async () => {
  const prisma = createMemoryPrisma();
  await prisma.school.create({ data: { name: 'Alpha', code: 'SCH-1', isActive: true } });

  const result = await importParsedFile(
    prisma,
    {
      datasetType: 'attendance',
      fileName: 'attendance.csv',
      mimeType: 'text/csv',
      sourceId: null,
      sourceType: 'GOOGLE_DRIVE',
      schoolId: null,
      triggeredById: 'user_1',
    },
    Buffer.from('School Code,Attendance %,Period\nSCH-1,150,August\n')
  );

  assert.equal(result.failedCount, 1);
  assert.equal(prisma.staffModuleEntry.values().length, 0);
});

test('importParsedFile skips duplicate rows', async () => {
  const prisma = createMemoryPrisma();
  await prisma.school.create({ data: { name: 'Alpha', code: 'SCH-1', isActive: true } });

  const result = await importParsedFile(
    prisma,
    {
      datasetType: 'attendance',
      fileName: 'attendance.csv',
      mimeType: 'text/csv',
      sourceId: null,
      sourceType: 'GOOGLE_DRIVE',
      schoolId: null,
      triggeredById: 'user_1',
    },
    Buffer.from('School Code,Attendance %,Period\nSCH-1,95,August\nSCH-1,94,August\n')
  );

  assert.equal(result.importedCount, 1);
  assert.equal(result.skippedCount, 1);
});

test('rollbackImportBatch removes imported schools', async () => {
  const prisma = createMemoryPrisma();
  const result = await importParsedFile(
    prisma,
    {
      datasetType: 'schools',
      fileName: 'schools.csv',
      mimeType: 'text/csv',
      sourceId: null,
      sourceType: 'GOOGLE_DRIVE',
      schoolId: null,
      triggeredById: 'user_1',
    },
    Buffer.from('name,code\nAlpha,SCH-1\n')
  );

  assert.equal(prisma.school.values().length, 1);
  await rollbackImportBatch(prisma, result.batchId, 'user_2');
  assert.equal(prisma.school.values().length, 0);
  const batch = await prisma.importBatch.findUnique({ where: { id: result.batchId }, include: { items: true } });
  assert.equal(batch?.status, 'ROLLED_BACK');
});

test('parseImportFile rejects unsupported or empty files', () => {
  assert.throws(() => parseImportFile({ buffer: Buffer.alloc(0), fileName: 'empty.csv', mimeType: 'text/csv' }));
  assert.throws(() => parseImportFile({ buffer: Buffer.from('abc'), fileName: 'notes.pdf', mimeType: 'application/pdf' }));
});

test('parseImportFile rejects files larger than 15 MB', () => {
  assert.throws(
    () => parseImportFile({
      buffer: Buffer.alloc(MAX_IMPORT_BYTES + 1),
      fileName: 'huge.csv',
      mimeType: 'text/csv',
    }),
    /maximum allowed size of 15 MB/,
  );
});

test('downloadGoogleDriveFile rejects oversized files from Content-Length before reading', async () => {
  let readerRequested = false;
  const response = {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-length': String(MAX_IMPORT_BYTES + 1) }),
    body: {
      getReader: () => {
        readerRequested = true;
        return {
          read: async () => ({ done: true, value: undefined }),
          cancel: async () => undefined,
          releaseLock: () => undefined,
        };
      },
    },
    arrayBuffer: async () => Buffer.alloc(0).buffer,
    text: async () => '',
  };

  await assert.rejects(
    () => withMockFetch(response, () => downloadGoogleDriveFile('file_1', 'token_1')),
    /maximum allowed size of 15 MB/,
  );
  assert.equal(readerRequested, false);
});

test('downloadGoogleDriveFile rejects oversized streamed files without Content-Length', async () => {
  const response = {
    ok: true,
    status: 200,
    headers: new Headers(),
    body: {
      getReader: () => {
        const chunk = new Uint8Array(MAX_IMPORT_BYTES + 1);
        let readCount = 0;
        return {
          read: async () => {
            readCount += 1;
            if (readCount === 1) {
              return { done: false, value: chunk };
            }
            return { done: true, value: undefined };
          },
          cancel: async () => undefined,
          releaseLock: () => undefined,
        };
      },
    },
    arrayBuffer: async () => Buffer.alloc(0).buffer,
    text: async () => '',
  };

  await assert.rejects(
    () => withMockFetch(response, () => downloadGoogleDriveFile('file_2', 'token_2')),
    /maximum allowed size of 15 MB/,
  );
});

async function main() {
  let passed = 0;
  for (const entry of tests) {
    try {
      await entry.run();
      passed += 1;
      console.log(`✓ ${entry.name}`);
    } catch (error) {
      console.error(`✗ ${entry.name}`);
      console.error(error);
      process.exitCode = 1;
      break;
    }
  }

  if (process.exitCode !== 1) {
    console.log(`\n${passed}/${tests.length} import tests passed`);
  }
}

void main();
