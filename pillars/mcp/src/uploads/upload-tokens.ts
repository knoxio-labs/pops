import { randomBytes } from 'node:crypto';

/** How long a minted upload URL stays usable. */
export const UPLOAD_TOKEN_TTL_MS = 10 * 60_000;

/** Bounds memory when a caller mints URLs it never uses. */
export const MAX_PENDING_UPLOADS = 100;

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
  /** Mint a token, or `undefined` when {@link MAX_PENDING_UPLOADS} unexpired tokens are outstanding. */
  mint(): UploadGrant | undefined;
  /** Spend a token. `true` exactly once per minted, unexpired token. */
  consume(token: string): boolean;
}

/** Build a token store. `now` is injectable for expiry tests. */
export function createUploadTokenStore(now: () => number = Date.now): UploadTokenStore {
  const expiries = new Map<string, number>();

  const prune = (): void => {
    const current = now();
    for (const [token, expiresAt] of expiries) {
      if (expiresAt <= current) expiries.delete(token);
    }
  };

  return {
    mint() {
      prune();
      if (expiries.size >= MAX_PENDING_UPLOADS) return undefined;
      const token = randomBytes(32).toString('base64url');
      const expiresAt = now() + UPLOAD_TOKEN_TTL_MS;
      expiries.set(token, expiresAt);
      return { token, expiresAt: new Date(expiresAt) };
    },
    consume(token) {
      const expiresAt = expiries.get(token);
      if (expiresAt === undefined) return false;
      expiries.delete(token);
      return expiresAt > now();
    },
  };
}

/** The process-wide store shared by the `createUpload` tool and the upload route. */
export const uploadTokens: UploadTokenStore = createUploadTokenStore();
