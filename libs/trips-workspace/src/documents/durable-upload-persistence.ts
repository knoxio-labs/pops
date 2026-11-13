import { ApiError } from '@pops/pillar-sdk/client';

import type { DurableUploadRecord } from './durable-upload-api';
import type { UploadJournal } from './durable-upload-journal';

/** The first journal binding and its cleanup failures, separate from canonical upload receipt proof. */
export class DurableUploadPersistence {
  private journal: UploadJournal | null = null;
  private error: string | null = null;

  /** Bind once; matching later views preserve the original journal and principal authority. */
  bind(journal: UploadJournal): void {
    if (this.journal !== null && this.journal.bindingKey() !== journal.bindingKey())
      throw new Error('This upload belongs to another account, server or source.');
    this.journal ??= journal;
  }

  /** The original account, server and target cache namespace, if bound. */
  bindingKey(): string | null {
    return this.journal?.bindingKey() ?? null;
  }

  /** Read cleanup diagnostics without weakening a known owner acknowledgement. */
  problem(): string | null {
    return this.error;
  }

  /** Refuse side effects while upload metadata cannot be durably admitted. */
  require(): UploadJournal {
    if (this.journal === null)
      throw new Error(
        'Upload recovery storage is unavailable. Verify sign-in and allow browser storage before sending this file.'
      );
    return this.journal;
  }

  /** Retire the captured principal when an actual owner request observes authorization loss. */
  observeAuthorization(error: unknown): void {
    if (!(error instanceof ApiError) || error.status !== 401) return;
    try {
      this.require().invalidate();
    } catch {
      this.error =
        'Upload authorization was lost and browser recovery metadata could not be cleared. Verify sign-in and browser storage before continuing.';
    }
  }

  /** Clear only this completed intent; an unavailable journal cannot erase the original receipt. */
  completeIfKnown(record: DurableUploadRecord | null): void {
    if (record?.state !== 'done' && record?.state !== 'duplicate') return;
    try {
      this.require().complete(record.input.operationId);
      this.error = null;
    } catch {
      this.error =
        'The original is saved in Documents, but local recovery metadata could not be cleared. Verify sign-in and browser storage; do not resend the file.';
    }
  }
}
