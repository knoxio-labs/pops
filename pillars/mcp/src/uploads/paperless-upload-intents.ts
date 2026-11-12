import { randomUUID } from 'node:crypto';

import { MAX_PENDING_UPLOADS, UPLOAD_TOKEN_TTL_MS } from './upload-tokens.js';

/** A gateway receipt is process-local; unavailable never proves that an upload was not accepted. */
export type PaperlessUploadState =
  | { readonly state: 'ready' | 'uploading' }
  | { readonly state: 'accepted'; readonly taskId: string }
  | { readonly state: 'not-sent' | 'refused' | 'unknown'; readonly reason: string }
  | { readonly state: 'unavailable'; readonly reason: string };

/** Bounded in-memory recovery for a single-use upload URL, independent of the HTTP caller remaining connected. */
export interface PaperlessUploadIntents {
  /** Allocate a receipt before issuing its single-use URL, or refuse when memory capacity is full. */
  create(): string | undefined;
  /** Read the retained outcome; absence never proves that the producer did not accept bytes. */
  read(id: string): PaperlessUploadState;
  /** Settle the existing receipt before replying to the HTTP uploader; does not create missing entries. */
  update(id: string, state: Exclude<PaperlessUploadState, { state: 'unavailable' }>): void;
}

/** Reuse the gateway's upload lifetime and capacity; active streams retain their slot until they settle. */
export function createPaperlessUploadIntents(now: () => number = Date.now): PaperlessUploadIntents {
  const entries = new Map<string, { expiresAt: number; value: PaperlessUploadState }>();
  const prune = (): void => {
    for (const [id, entry] of entries) {
      if (entry.value.state !== 'uploading' && entry.expiresAt <= now()) entries.delete(id);
    }
  };
  return {
    create() {
      prune();
      if (entries.size >= MAX_PENDING_UPLOADS) return undefined;
      const id = randomUUID();
      entries.set(id, {
        expiresAt: now() + UPLOAD_TOKEN_TTL_MS,
        value: Object.freeze({ state: 'ready' }),
      });
      return id;
    },
    read(id) {
      prune();
      return (
        entries.get(id)?.value ?? {
          state: 'unavailable',
          reason:
            'Upload receipt is unknown, expired or lost after a gateway restart. The file may have been accepted. Do not upload it again automatically.',
        }
      );
    },
    update(id, value) {
      const entry = entries.get(id);
      if (entry)
        entries.set(id, {
          expiresAt: now() + UPLOAD_TOKEN_TTL_MS,
          value: Object.freeze({ ...value }),
        });
    },
  };
}

/** Shared process-local receipts used by the upload route and authenticated MCP recovery tool. */
export const paperlessUploadIntents = createPaperlessUploadIntents();
