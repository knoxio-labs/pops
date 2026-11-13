import type { DocumentUploadHostCapability } from '@pops/pillar-sdk';

import type { Client as RegistryClient } from '../registry-api/client';

/** Explicit server authority and testable browser adapters for upload metadata verification. */
export interface DocumentUploadHostOptions {
  server?: string;
  client?: RegistryClient;
  storage?: () => Storage;
}

/** Account authority plus a storage-event handler; the shell owns listener installation. */
export interface ShellUploadHost extends DocumentUploadHostCapability {
  /** Reread actual storage so delayed events cannot retire or purge a newer account. */
  handleStorageEvent(event: Pick<StorageEvent, 'key' | 'newValue' | 'storageArea'>): void;
}
