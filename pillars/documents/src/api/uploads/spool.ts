import { createHash, randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { link, mkdir, open, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { UploadParamsSchema } from '../../contract/upload-schemas.js';
import { uploadErrors } from './errors.js';

import type { FileHandle } from 'node:fs/promises';

import type { UploadInput } from '../../contract/upload-schemas.js';

function sameVersion(before: Stats, after: Stats): boolean {
  return (
    after.isFile() &&
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mtimeMs === after.mtimeMs &&
    before.ctimeMs === after.ctimeMs
  );
}

async function openRegular(path: string): Promise<FileHandle> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!(await file.stat()).isFile()) uploadErrors.invalid();
    return file;
  } catch (error) {
    await file.close();
    throw error;
  }
}

/** Verified inode held open through dispatch; path replacement cannot substitute another file. */
export interface VerifiedUploadFile {
  readonly bytes: AsyncIterable<Uint8Array>;
  readonly length: number;
  close(): Promise<void>;
}

async function syncDirectory(path: string): Promise<void> {
  const directory = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  );
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

/** Private durable file admission; only validated UUIDs become filenames, never client filenames. */
export class UploadSpool {
  constructor(private readonly directory: string) {}

  /** Count, hash and fsync all bytes before atomically publishing a non-overwritable operation file. */
  async admit(input: UploadInput, source: AsyncIterable<Uint8Array>): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await syncDirectory(dirname(this.directory));
    await syncDirectory(this.directory);
    const temporary = join(this.directory, `${randomUUID()}.partial`);
    const file = await open(temporary, 'wx', 0o600);
    try {
      const digest = createHash('sha256');
      let length = 0;
      for await (const chunk of source) {
        length += chunk.byteLength;
        if (length > input.byteLength) uploadErrors.invalid();
        digest.update(chunk);
        await file.writeFile(chunk);
      }
      if (length !== input.byteLength || digest.digest('hex') !== input.sha256)
        uploadErrors.invalid();
      await file.sync();
      await file.close();
      try {
        await link(temporary, this.path(input.operationId));
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
        const existing = await this.openVerified(input);
        await existing.close();
      }
      await syncDirectory(this.directory);
    } finally {
      await file.close();
      await unlink(temporary).catch((error: unknown) => {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
      });
    }
  }

  /** Revalidate admitted bytes before a dispatch claim; missing/corrupt bytes never reach Paperless. */
  async openVerified(input: UploadInput): Promise<VerifiedUploadFile> {
    const file = await openRegular(this.path(input.operationId));
    const digest = createHash('sha256');
    let length = 0;
    try {
      const before = await file.stat();
      for await (const chunk of file.createReadStream({ start: 0, autoClose: false })) {
        if (!(chunk instanceof Uint8Array)) uploadErrors.invalid();
        length += chunk.byteLength;
        if (length > input.byteLength) uploadErrors.invalid();
        digest.update(chunk);
      }
      const after = await file.stat();
      if (
        !sameVersion(before, after) ||
        length !== input.byteLength ||
        digest.digest('hex') !== input.sha256
      )
        uploadErrors.invalid();
      async function* bytes(): AsyncGenerator<Uint8Array> {
        for await (const chunk of file.createReadStream({ start: 0, autoClose: false })) {
          if (!(chunk instanceof Uint8Array)) uploadErrors.invalid();
          yield chunk;
        }
      }
      return { bytes: bytes(), length, close: () => file.close() };
    } catch (error) {
      await file.close();
      throw error;
    }
  }

  /** Release bytes only after durable done/duplicate proof; repeated release is harmless. */
  async release(operationId: string): Promise<void> {
    await unlink(this.path(operationId)).catch((error: unknown) => {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    });
    await syncDirectory(this.directory);
  }

  private path(operationId: string): string {
    return join(this.directory, `${UploadParamsSchema.parse({ operationId }).operationId}.blob`);
  }
}
