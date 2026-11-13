import {
  createDurableUpload,
  dispatchDurableUpload,
  putDurableUploadContent,
  readDurableUpload,
} from './durable-upload-api';
import { DurableUploadRecoveryRequired } from './durable-upload-errors';
import { digestFile, prepareUploadInput } from './durable-upload-input';
import { DurableUploadPersistence } from './durable-upload-persistence';
import { retainDurableRecord } from './durable-upload-proof';

import type {
  DurableUploadInput,
  DurableUploadRecord,
  DurableUploadTransport,
} from './durable-upload-api';
import type { UploadJournal } from './durable-upload-journal';

export { DurableUploadRecoveryRequired } from './durable-upload-errors';

/** One immutable upload operation, its browser File and owner proof; the bound journal persists metadata only. */
export class DurableUploadOperation {
  private input: DurableUploadInput | null = null;
  private preparing: Promise<DurableUploadInput> | null = null;
  private record: DurableUploadRecord | null = null;
  private recoveryRequired = false;
  private active = false;
  private readonly persistence = new DurableUploadPersistence();
  private restoredRead = false;
  private archiveMatches: boolean | null = null;

  constructor(
    readonly operationId: string,
    private file: File | null
  ) {}

  /** Restore metadata only; recovery starts with GET and never assumes selected File bytes survived. */
  static restore(input: DurableUploadInput, journal: UploadJournal): DurableUploadOperation {
    const operation = new DurableUploadOperation(input.operationId, null);
    operation.input = Object.freeze(structuredClone(input));
    operation.persistence.bind(journal);
    operation.recoveryRequired = true;
    operation.restoredRead = true;
    return operation;
  }

  /** Bind the first exact persistent context; a later view cannot retarget this operation. */
  bindJournal(journal: UploadJournal): void {
    this.persistence.bind(journal);
  }

  /** Latest explicit owner-match evidence, kept separate from a retained task/original receipt. */
  ownerMatches(): boolean | null {
    return this.archiveMatches;
  }

  /** Keep task caches scoped to this operation's original account/owner binding. */
  persistenceBinding(): string | null {
    return this.persistence.bindingKey();
  }

  /** Schedule one initial GET for restored metadata, shared by overlapping views. */
  takeRestoredRead(): boolean {
    if (!this.restoredRead) return false;
    this.restoredRead = false;
    return true;
  }

  /** Read prior validated owner facts for rendering; this never creates an acknowledgement. */
  readRecord(): DurableUploadRecord | null {
    return this.record === null ? null : structuredClone(this.record);
  }

  /** Surface a failed completion cleanup without replacing a valid owner receipt with uncertainty. */
  storageProblem(): string | null {
    return this.persistence.problem();
  }

  /** Verify a specifically reattached File against immutable bytes; metadata and operation UUID remain unchanged. */
  async reattach(file: File): Promise<void> {
    if (
      this.active ||
      this.input === null ||
      this.needsRecovery() ||
      (this.record !== null &&
        this.record.state !== 'awaiting_content' &&
        this.record.state !== 'admitted')
    )
      throw new Error('Check upload status before reattaching the original file.');
    this.active = true;
    try {
      await this.persistence.require().verify();
      if (file.size !== this.input.byteLength || (await digestFile(file)) !== this.input.sha256)
        throw new Error(
          'This file does not match the retained upload fingerprint. Select the original file.'
        );
      this.persistence.require().assertCurrent();
      this.file = file;
    } finally {
      this.active = false;
    }
  }

  /** Return detached metadata so external callers cannot change a retained replay payload. */
  readInput(): DurableUploadInput | null {
    return this.input === null ? null : structuredClone(this.input);
  }

  /** Report uncertainty independently of transient query and mutation cache state. */
  needsRecovery(): boolean {
    return this.recoveryRequired || this.record?.state === 'outcome_unknown';
  }

  /** Upload only the original File; known admitted/accepted states never resend its bytes. */
  async start(transport: DurableUploadTransport): Promise<DurableUploadRecord> {
    if (this.active) throw new Error('This upload operation already has a request in progress.');
    if (this.needsRecovery()) throw new DurableUploadRecoveryRequired();
    this.active = true;
    try {
      return await this.resume(transport);
    } finally {
      this.active = false;
    }
  }

  private async resume(transport: DurableUploadTransport): Promise<DurableUploadRecord> {
    if (this.record?.taskId !== null && this.record?.taskId !== undefined)
      return structuredClone(this.record);
    const input = await this.prepare();
    const file = this.file;
    if (file === null)
      throw new Error(
        'Reattach the original selected File before continuing this restored upload.'
      );
    this.record ??= await this.write(() => createDurableUpload(input, transport), transport);
    if (
      !this.record.ownerMatches &&
      (this.record.state === 'awaiting_content' || this.record.state === 'admitted')
    )
      throw new Error('Restore the original Documents archive before continuing this upload.');
    if (this.record.state === 'awaiting_content') {
      this.record = await this.write(
        () => putDurableUploadContent(input, file, transport),
        transport
      );
    }
    if (this.record.state === 'admitted')
      this.record = await this.write(() => dispatchDurableUpload(input, transport), transport);
    this.persistence.completeIfKnown(this.record);
    return structuredClone(this.record);
  }

  /** Recover by immutable UUID through GET only; even a still-unknown result never dispatches. */
  async recover(transport: DurableUploadTransport): Promise<DurableUploadRecord | null> {
    if (this.active) throw new Error('This upload operation already has a request in progress.');
    const input = this.input;
    if (input === null) throw new Error('This file has no prepared upload operation to recover.');
    this.active = true;
    try {
      await this.persistence.require().verify();
      const record = await readDurableUpload(input, transport);
      if (record === null) {
        if (this.record?.taskId !== null && this.record?.taskId !== undefined)
          return structuredClone(this.record);
        this.record = null;
        this.recoveryRequired = false;
        return null;
      }
      this.adopt(record);
      this.persistence.completeIfKnown(this.record);
      return this.record === null ? null : structuredClone(this.record);
    } catch (error) {
      this.persistence.observeAuthorization(error);
      throw error;
    } finally {
      this.active = false;
    }
  }

  private adopt(record: DurableUploadRecord): void {
    this.record = retainDurableRecord(this.record, record);
    this.archiveMatches = record.ownerMatches;
    this.recoveryRequired = this.record.state === 'outcome_unknown';
  }

  private prepare(): Promise<DurableUploadInput> {
    if (this.input !== null) return Promise.resolve(this.input);
    if (this.preparing !== null) return this.preparing;
    const file = this.file;
    if (file === null)
      return Promise.reject(new Error('Select the original file before uploading.'));
    this.preparing ??= prepareUploadInput(this.operationId, file).then((input) => {
      this.input = input;
      return input;
    });
    return this.preparing;
  }

  private async write(
    request: () => Promise<DurableUploadRecord>,
    transport: DurableUploadTransport
  ): Promise<DurableUploadRecord> {
    await this.persistence.require().verify();
    const input = this.input;
    if (input === null) throw new Error('The upload input has not been prepared.');
    this.persistence.require().admit(input);
    transport.beforeRequest();
    this.recoveryRequired = true;
    let record: DurableUploadRecord;
    try {
      record = await request();
    } catch (error) {
      this.persistence.observeAuthorization(error);
      throw error;
    }
    this.archiveMatches = record.ownerMatches;
    this.recoveryRequired = record.state === 'outcome_unknown';
    return record;
  }
}
