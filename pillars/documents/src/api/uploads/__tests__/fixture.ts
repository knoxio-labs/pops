import { createHash, randomUUID } from 'node:crypto';
import { copyFile, cp, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDocumentsDb } from '../../../db/open-documents-db.js';
import { DispatchGuard, provisionDispatchGuard } from '../dispatch-guard.js';
import { DurableUploads } from '../service.js';
import { paperlessFixture } from './paperless-fixture.js';
import { chunks } from './streams.js';

import type { ServerResponse } from 'node:http';

import type { UploadInput, UploadRecord } from '../../../contract/upload-schemas.js';
import type { OpenedDocumentsDb } from '../../../db/open-documents-db.js';
import type { PaperlessClient } from '../../modules/paperless/client.js';

class UploadFixture {
  readonly bytes = Buffer.from('%PDF-fictional-upload-fixture');
  readonly directory: string;
  readonly guardDirectory: string;
  readonly guardId = randomUUID();
  readonly input: UploadInput;
  private current: PaperlessClient | null;
  private currentDatabase: OpenedDocumentsDb;
  private currentService: DurableUploads;

  constructor(
    private readonly root: string,
    readonly client: PaperlessClient,
    private readonly upstream: ReturnType<typeof paperlessFixture>
  ) {
    this.directory = join(root, 'store');
    this.guardDirectory = join(root, 'guard');
    provisionDispatchGuard(this.guardDirectory, this.guardId);
    this.current = client;
    this.currentDatabase = openDocumentsDb(join(this.directory, 'documents.db'));
    this.currentService = this.openService();
    this.input = {
      operationId: randomUUID(),
      fileName: 'fictional.pdf',
      mimeType: 'application/pdf',
      byteLength: this.bytes.byteLength,
      sha256: createHash('sha256').update(this.bytes).digest('hex'),
    };
  }

  get service(): DurableUploads {
    return this.currentService;
  }

  get database(): OpenedDocumentsDb {
    return this.currentDatabase;
  }

  get posts(): number {
    return this.upstream.posts;
  }

  get postBodies(): string[] {
    return this.upstream.postBodies;
  }

  get taskReads(): number {
    return this.upstream.taskReads;
  }

  get held(): ServerResponse | undefined {
    return this.upstream.held;
  }

  waitHeld(): Promise<ServerResponse> {
    return this.upstream.waitHeld();
  }

  setMode(value: Parameters<ReturnType<typeof paperlessFixture>['setMode']>[0]): void {
    this.upstream.setMode(value);
  }

  setTask(value: Parameters<ReturnType<typeof paperlessFixture>['setTask']>[0]): void {
    this.upstream.setTask(value);
  }

  setOwner(value: PaperlessClient | null): void {
    this.current = value;
  }

  async admit(): Promise<UploadRecord> {
    this.currentService.create(this.input);
    return this.currentService.content(
      this.input.operationId,
      this.input.mimeType,
      chunks(this.bytes)
    );
  }

  reopen(): void {
    this.currentDatabase.raw.close();
    this.currentDatabase = openDocumentsDb(join(this.directory, 'documents.db'));
    this.currentService = this.openService();
  }

  async restore(snapshot: string): Promise<void> {
    this.currentDatabase.raw.close();
    await rm(join(this.directory, 'documents.db-wal'), { force: true });
    await rm(join(this.directory, 'documents.db-shm'), { force: true });
    await copyFile(join(snapshot, 'documents.db'), join(this.directory, 'documents.db'));
    await rm(join(this.directory, 'spool'), { recursive: true, force: true });
    await cp(join(snapshot, 'spool'), join(this.directory, 'spool'), { recursive: true });
    this.currentDatabase = openDocumentsDb(join(this.directory, 'documents.db'));
    this.currentService = this.openService();
  }

  async close(): Promise<void> {
    this.currentDatabase.raw.close();
    await this.upstream.close();
    await rm(this.root, { recursive: true, force: true });
  }

  private openService(): DurableUploads {
    return new DurableUploads(
      this.currentDatabase.db,
      join(this.directory, 'spool'),
      new DispatchGuard(this.currentDatabase.db, this.guardDirectory, this.guardId, this.directory),
      (): PaperlessClient | null => this.current
    );
  }
}

/** Exact production ledger/spool and actual HTTP Paperless client, with a reopenable private DB. */
export async function uploadFixture(): Promise<UploadFixture> {
  const temporaryRoot = fileURLToPath(new URL('../../../../../../tmp/', import.meta.url));
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(join(temporaryRoot, 'documents-upload-'));
  const upstream = paperlessFixture();
  const client = await upstream.listen();
  return new UploadFixture(root, client, upstream);
}
