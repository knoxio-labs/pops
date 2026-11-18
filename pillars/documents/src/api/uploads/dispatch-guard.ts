import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { UploadInputSchema, UploadParamsSchema } from '../../contract/upload-schemas.js';
import { uploads, uploadStore } from '../../db/schema.js';
import { uploadErrors } from './errors.js';

import type { DocumentsDb } from '../../db/open-documents-db.js';
import type { UploadRow } from '../../db/schema.js';

const markerSchema = z.strictObject({ version: z.literal(1), guardId: z.uuid() });
const tombstoneSchema = z.strictObject({
  version: z.literal(1),
  guardId: z.uuid(),
  operationId: z.uuid(),
  input: UploadInputSchema,
  owner: z.string().regex(/^[a-f0-9]{64}$/),
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
  claim: z.uuid(),
});

function syncDirectory(directory: string): void {
  const handle = openSync(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  );
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

function readRegular(path: string): unknown {
  const handle = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!fstatSync(handle).isFile()) uploadErrors.storage();
    return JSON.parse(readFileSync(handle, 'utf8'));
  } finally {
    closeSync(handle);
  }
}

function writeExclusive(path: string, value: unknown): void {
  const handle = openSync(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600
  );
  try {
    writeFileSync(handle, JSON.stringify(value));
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

/** Explicit operator provisioning only. The HTTP server never invokes this or recreates a missing marker. */
export function provisionDispatchGuard(directory: string, guardId: string): void {
  const marker = markerSchema.parse({ version: 1, guardId });
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  syncDirectory(dirname(directory));
  if (readdirSync(directory).length !== 0)
    throw new Error('Dispatch guard provisioning requires a new empty directory');
  writeExclusive(join(directory, 'binding.json'), marker);
  syncDirectory(directory);
}

/** Dispatch history retained outside ledger/spool restores. Whole-authority rollback remains unverifiable. */
export class DispatchGuard {
  constructor(
    private readonly db: DocumentsDb,
    private readonly directory: string,
    private readonly expectedId: string | undefined,
    private readonly dataDirectory: string
  ) {}

  /** Validate external deployment identity and the immutable DB binding; bind only a genuinely empty new ledger. */
  available(): boolean {
    try {
      const scope = relative(realpathSync(this.dataDirectory), realpathSync(this.directory));
      if (scope === '' || (!isAbsolute(scope) && scope !== '..' && !scope.startsWith(`..${sep}`)))
        return false;
      syncDirectory(this.directory);
      const marker = markerSchema.parse(readRegular(join(this.directory, 'binding.json')));
      if (marker.guardId !== this.expectedId) return false;
      this.db.transaction(
        () => {
          if (
            this.db.select().from(uploadStore).get() === undefined &&
            this.db.select({ id: uploads.operationId }).from(uploads).limit(1).get() === undefined
          ) {
            this.db
              .insert(uploadStore)
              .values({ id: 1, guardId: marker.guardId })
              .onConflictDoNothing()
              .run();
          }
        },
        { behavior: 'immediate' }
      );
      return (
        this.db.select().from(uploadStore).where(eq(uploadStore.id, 1)).get()?.guardId ===
        marker.guardId
      );
    } catch {
      return false;
    }
  }

  /** Observe retained claims without changing a possibly active original claimant's DB transition. */
  status(row: UploadRow): 'clear' | 'claimed' | 'unavailable' {
    try {
      const value = this.find(row.operationId);
      if (value === undefined) return 'clear';
      return value.owner === row.owner && value.inputDigest === this.digest(row)
        ? 'claimed'
        : 'unavailable';
    } catch {
      return 'unavailable';
    }
  }

  /** Recover only original input/claim when a restored DB predates its intent; no task/original receipt is inferred. */
  find(operationId: string): z.infer<typeof tombstoneSchema> | undefined {
    if (!this.available()) return uploadErrors.storage();
    let value: unknown;
    try {
      value = readRegular(this.path(operationId));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
      return uploadErrors.storage();
    }
    const parsed = tombstoneSchema.safeParse(value);
    if (!parsed.success) return uploadErrors.storage();
    const claim = parsed.data;
    if (
      claim.guardId !== this.expectedId ||
      claim.operationId !== operationId ||
      claim.input.operationId !== operationId ||
      claim.inputDigest !== createHash('sha256').update(JSON.stringify(claim.input)).digest('hex')
    )
      return uploadErrors.storage();
    return claim;
  }

  /** Durable exclusive tombstone before the SQLite claim; even an interrupted publication is never retried. */
  acquire(row: UploadRow): string | undefined {
    if (!this.available()) return uploadErrors.storage();
    const claim = randomUUID();
    try {
      writeExclusive(
        this.path(row.operationId),
        tombstoneSchema.parse({
          version: 1,
          guardId: this.expectedId,
          operationId: row.operationId,
          input: UploadInputSchema.parse(JSON.parse(row.input)),
          owner: row.owner,
          inputDigest: this.digest(row),
          claim,
        })
      );
      syncDirectory(this.directory);
      return claim;
    } catch {
      if (this.status(row) === 'clear') return uploadErrors.storage();
      return undefined;
    }
  }

  private path(operationId: string): string {
    return join(this.directory, `${UploadParamsSchema.parse({ operationId }).operationId}.claim`);
  }
  private digest(row: UploadRow): string {
    return createHash('sha256').update(row.input).digest('hex');
  }
}
