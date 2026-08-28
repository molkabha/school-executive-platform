import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

export interface TempUploadInfo {
  id: string;
  filePath: string;
  fileName: string;
  mimeType: string | null;
  size: number;
  createdAt: string;
  userId: string;
}

const TEMP_DIR = path.join(os.tmpdir(), 'school-executive-platform-uploads');

async function ensureTempDir() {
  await fs.mkdir(TEMP_DIR, { recursive: true });
}

function manifestPath(id: string) {
  return path.join(TEMP_DIR, `${id}.json`);
}

function filePath(id: string) {
  return path.join(TEMP_DIR, `${id}.bin`);
}

export async function createTempUpload(buffer: Buffer, fileName: string, mimeType: string | null, userId: string): Promise<TempUploadInfo> {
  await ensureTempDir();
  const id = crypto.randomUUID();
  const upload: TempUploadInfo = {
    id,
    filePath: filePath(id),
    fileName,
    mimeType,
    size: buffer.byteLength,
    createdAt: new Date().toISOString(),
    userId,
  };

  await fs.writeFile(upload.filePath, buffer);
  await fs.writeFile(manifestPath(id), JSON.stringify(upload), 'utf8');
  return upload;
}

export async function readTempUpload(id: string, userId: string): Promise<{ info: TempUploadInfo; buffer: Buffer }> {
  const manifest = await fs.readFile(manifestPath(id), 'utf8').catch(() => null);
  if (!manifest) {
    throw new Error('Uploaded file not found or has expired.');
  }

  const info = JSON.parse(manifest) as TempUploadInfo;
  if (info.userId !== userId) {
    // Use the same error message to avoid revealing that the file
    // exists but belongs to another user.
    throw new Error('Uploaded file not found or has expired.');
  }
  const buffer = await fs.readFile(info.filePath);
  return { info, buffer };
}

export async function deleteTempUpload(id: string): Promise<void> {
  await fs.rm(filePath(id), { force: true }).catch(() => undefined);
  await fs.rm(manifestPath(id), { force: true }).catch(() => undefined);
}

