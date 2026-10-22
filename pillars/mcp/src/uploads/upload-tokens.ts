import { randomBytes } from 'node:crypto';

/** How long a minted upload URL stays usable. */
export const UPLOAD_TOKEN_TTL_MS = 10 * 60_000;

/** Bounds memory when a caller mints URLs it never uses. */
export const MAX_PENDING_UPLOADS = 100;

/** The kinds inventory classifies an item document as (its `DOCUMENT_TYPES`). */
export const DOCUMENT_TYPES = ['receipt', 'warranty', 'manual', 'invoice', 'other'] as const;

/** One of {@link DOCUMENT_TYPES}. */
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** A URL for an item photo, stored in inventory's content-addressed media store. */
export interface PhotoUploadTarget {
  readonly kind: 'photo';
}

/**
 * A URL for one document on one item, streamed to inventory's
 * `POST /items/:itemId/documents/upload`. `maxBytes` and `allowedMimeTypes`
 * are the limits documents stated when the URL was minted.
 */
export interface DocumentUploadTarget {
  readonly kind: 'document';
  readonly itemId: string;
  readonly documentType: DocumentType;
  readonly fileName: string;
  readonly title?: string;
  readonly maxBytes: number;
  readonly allowedMimeTypes: readonly string[];
}

/** What a minted upload URL is for; the upload route dispatches on `kind`. */
export type UploadTarget = PhotoUploadTarget | DocumentUploadTarget;

/** A minted single-use upload credential. */
export interface UploadGrant {
  readonly token: string;
  readonly expiresAt: Date;
}

/**
 * In-memory single-use upload credentials. The token in an upload URL is the
 * only credential `PUT /uploads/:token` checks, so it must be unguessable,
 * short-lived and spent on first use. State is per-process: a restart voids
 * every outstanding URL, which only costs the caller a new `createUpload`.
 */
export interface UploadTokenStore {
  /** Mint a token for `target`, or `undefined` when {@link MAX_PENDING_UPLOADS} unexpired tokens are outstanding. */
  mint(target: UploadTarget): UploadGrant | undefined;
  /** Spend a token. Its target exactly once per minted, unexpired token; `undefined` otherwise. */
  consume(token: string): UploadTarget | undefined;
}

interface Pending {
  readonly expiresAt: number;
  readonly target: UploadTarget;
}

/** Build a token store. `now` is injectable for expiry tests. */
export function createUploadTokenStore(now: () => number = Date.now): UploadTokenStore {
  const pending = new Map<string, Pending>();

  const prune = (): void => {
    const current = now();
    for (const [token, entry] of pending) {
      if (entry.expiresAt <= current) pending.delete(token);
    }
  };

  return {
    mint(target) {
      prune();
      if (pending.size >= MAX_PENDING_UPLOADS) return undefined;
      const token = randomBytes(32).toString('base64url');
      const expiresAt = now() + UPLOAD_TOKEN_TTL_MS;
      pending.set(token, { expiresAt, target });
      return { token, expiresAt: new Date(expiresAt) };
    },
    consume(token) {
      const entry = pending.get(token);
      if (entry === undefined) return undefined;
      pending.delete(token);
      return entry.expiresAt > now() ? entry.target : undefined;
    },
  };
}

/** The process-wide store shared by the `createUpload` tools and the upload route. */
export const uploadTokens: UploadTokenStore = createUploadTokenStore();
