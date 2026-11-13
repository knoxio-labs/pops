import { client as defaultRegistryClient } from '../registry-api/client.gen';
import {
  DocumentUploadHostStorage,
  uploadHostServerOrigin,
  uploadHostUnavailable,
} from './document-upload-host-storage';

import type { UploadPersistenceLease } from '@pops/pillar-sdk';

import type { Client as RegistryClient } from '../registry-api/client';
import type { UploadHostMarker } from './document-upload-host-storage';
import type { DocumentUploadHostOptions } from './document-upload-host-types';

/** Internal authority state shared by lifecycle verification and account-scoped leases. */
export class DocumentUploadHostState {
  readonly server: string;
  readonly client: RegistryClient;
  readonly capturedRegistryUrl: string;
  readonly metadata: DocumentUploadHostStorage;
  generation = 0;
  requiresFreshVerification = false;
  active: UploadPersistenceLease | null = null;
  observed: UploadHostMarker | null = null;
  verificationMarker: UploadHostMarker | null = null;
  problem: string | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(options: DocumentUploadHostOptions) {
    this.server = uploadHostServerOrigin(options.server ?? window.location.origin);
    this.client = options.client ?? defaultRegistryClient;
    this.capturedRegistryUrl = this.registryUrl();
    if (new URL(this.capturedRegistryUrl).origin !== this.server)
      throw new Error('Upload recovery requires Registry on the captured server.');
    this.metadata = new DocumentUploadHostStorage(
      this.server,
      () => options.storage?.() ?? window.localStorage
    );
  }

  registryUrl(): string {
    const baseUrl = this.client.getConfig().baseUrl;
    if (baseUrl === undefined || baseUrl.length === 0) throw new Error(uploadHostUnavailable);
    return new URL(baseUrl, this.server).href;
  }

  notify(): void {
    for (const listener of this.listeners) listener();
  }

  quarantine(): void {
    this.generation += 1;
    this.active = null;
    this.problem = uploadHostUnavailable;
    this.notify();
  }

  retire(): void {
    const marker = this.metadata.readMarker();
    const accounts = new Set([this.observed?.account, marker?.account]);
    for (const account of accounts) if (account !== undefined) this.metadata.purge(account);
    this.metadata.removeMarker();
    this.observed = null;
  }

  assertLatest(readGeneration: number): void {
    if (this.generation !== readGeneration) throw new Error(uploadHostUnavailable);
    if (this.registryUrl() !== this.capturedRegistryUrl) throw new Error(uploadHostUnavailable);
  }

  invalidate(): void {
    this.quarantine();
    try {
      this.retire();
    } catch {
      throw new Error(uploadHostUnavailable);
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  handleStorageEvent(event: Pick<StorageEvent, 'key' | 'newValue' | 'storageArea'>): void {
    if (event.key !== null && event.key !== this.metadata.markerKey) return;
    try {
      if (event.storageArea !== null && event.storageArea !== this.metadata.storage()) return;
      if (this.active !== null) {
        if (!this.active.isCurrent()) this.quarantine();
        return;
      }
      this.checkVerificationMarker();
    } catch {
      this.quarantine();
    }
  }

  private checkVerificationMarker(): void {
    const expected = this.verificationMarker ?? this.observed;
    if (expected === null) return;
    const actual = this.metadata.readMarker();
    if (actual?.account !== expected.account || actual.epoch !== expected.epoch) this.quarantine();
  }
}
