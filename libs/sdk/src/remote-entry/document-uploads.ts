/** Verified account/server epoch supplied by the host, never inferred from a client or label. */
export interface UploadPersistenceIdentity {
  readonly account: string;
  readonly server: string;
  readonly epoch: string;
}

/** Account-scoped metadata only. Every method rejects an unknown or retired identity epoch. */
export interface UploadPersistenceLease {
  readonly identity: Readonly<UploadPersistenceIdentity>;
  /** Enumerate metadata keys only within this exact account/server/epoch. */
  keys(): readonly string[];
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
  /** Fresh server verification before an independent upload request; stale completions cannot revive this lease. */
  verify(): Promise<void>;
  isCurrent(): boolean;
  /** Retire only this captured account/epoch on observed authorization loss; never invalidate a newer account. */
  invalidate(): void;
}

/**
 * Browser host authority for reload-safe upload metadata. No File bytes or credentials are stored.
 * A closed app cannot observe external logout; startup, focus, pageshow and each upload action reverify.
 */
export interface DocumentUploadHostCapability {
  /** Start a new lifecycle generation; supersede pending action verification and quarantine prior identity until the result. */
  verify(): Promise<UploadPersistenceLease>;
  /** No metadata access is allowed while this returns null. */
  current(): UploadPersistenceLease | null;
  /** Safe actionable status after verification/storage failure; never contains credentials. */
  problem(): string | null;
  /** Invalidate and purge the observed account on an actual host sign-out path. */
  invalidate(): void;
  subscribe(listener: () => void): () => void;
}
