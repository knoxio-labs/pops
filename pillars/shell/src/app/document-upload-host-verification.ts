import { sessionGet } from '../registry-api/sdk.gen';
import { zSessionGetResponse } from '../registry-api/zod.gen';
import { createDocumentUploadHostLease } from './document-upload-host-lease';
import { uploadHostUnavailable } from './document-upload-host-storage';

import type { UploadPersistenceLease } from '@pops/pillar-sdk';

import type { DocumentUploadHostState } from './document-upload-host-state';
import type { UploadHostMarker } from './document-upload-host-storage';

type VerificationKind = 'action' | 'lifecycle';
interface PendingVerification {
  generation: number;
  kind: VerificationKind;
  registryUrl: string;
  marker: string;
  promise: Promise<UploadPersistenceLease>;
}

/** Internal fresh-session verifier; only unchanged sibling action checks share a request. */
export class DocumentUploadHostVerification {
  private inFlight: PendingVerification | null = null;

  constructor(private readonly state: DocumentUploadHostState) {}

  verify(kind: VerificationKind = 'lifecycle'): Promise<UploadPersistenceLease> {
    try {
      const currentUrl = this.state.registryUrl();
      const marker = JSON.stringify(this.state.metadata.readMarker());
      if (this.canShare(kind, currentUrl, marker) && this.inFlight !== null)
        return this.inFlight.promise;
      const readGeneration = ++this.state.generation;
      if (kind === 'lifecycle') {
        this.state.active = null;
        this.state.problem = null;
        this.state.notify();
      }
      const baseline = this.state.metadata.readMarker();
      this.state.verificationMarker = baseline;
      const pending: PendingVerification = {
        generation: readGeneration,
        kind,
        registryUrl: currentUrl,
        marker,
        promise: this.verifySession(readGeneration, baseline),
      };
      this.inFlight = pending;
      const clearPending = () => {
        if (this.inFlight === pending) this.inFlight = null;
      };
      void pending.promise.then(clearPending, clearPending);
      return pending.promise;
    } catch {
      this.state.quarantine();
      return Promise.reject(new Error(uploadHostUnavailable));
    }
  }

  private canShare(kind: VerificationKind, registryUrl: string, marker: string): boolean {
    return (
      kind === 'action' &&
      Boolean(this.state.active?.isCurrent()) &&
      this.inFlight?.kind === 'action' &&
      this.inFlight.generation === this.state.generation &&
      this.inFlight.registryUrl === registryUrl &&
      this.inFlight.marker === marker
    );
  }

  private async verifySession(
    readGeneration: number,
    baseline: UploadHostMarker | null
  ): Promise<UploadPersistenceLease> {
    try {
      this.state.assertLatest(readGeneration);
      const result = await sessionGet({
        client: this.state.client,
        baseUrl: this.state.capturedRegistryUrl,
        redirect: 'error',
        responseStyle: 'fields',
        throwOnError: false,
      });
      this.state.assertLatest(readGeneration);
      const previous = this.state.metadata.readMarker();
      if (JSON.stringify(previous) !== JSON.stringify(baseline))
        throw new Error(uploadHostUnavailable);
      if (result.response?.status === 401) {
        this.state.retire();
        throw new Error(uploadHostUnavailable);
      }
      if (result.response?.status !== 200 || result.error !== undefined)
        throw new Error(uploadHostUnavailable);
      const session = zSessionGetResponse.parse(result.data);
      if (session.email === null || session.email.trim().length === 0)
        throw new Error(uploadHostUnavailable);
      const marker = this.reconcileAccount(session.email, previous);
      this.state.metadata.writeMarker(marker);
      this.state.assertLatest(readGeneration);
      return this.activate(marker, readGeneration);
    } catch {
      if (this.state.generation === readGeneration) {
        this.state.active = null;
        this.state.problem = uploadHostUnavailable;
        this.state.notify();
      }
      throw new Error(uploadHostUnavailable);
    }
  }

  private reconcileAccount(account: string, previous: UploadHostMarker | null): UploadHostMarker {
    const retiredAccounts = new Set([this.state.observed?.account, previous?.account]);
    for (const retired of retiredAccounts)
      if (retired !== undefined && retired !== account) this.state.metadata.purge(retired);
    if (previous !== null && previous.account !== account) this.state.metadata.removeMarker();
    return previous?.account === account
      ? previous
      : { version: 1, account, epoch: crypto.randomUUID() };
  }

  private activate(marker: UploadHostMarker, readGeneration: number): UploadPersistenceLease {
    this.state.observed = marker;
    const verified = createDocumentUploadHostLease(this.state, marker, () => this.verify('action'));
    this.state.requiresFreshVerification = false;
    this.state.active = verified;
    this.state.problem = null;
    this.state.notify();
    this.state.assertLatest(readGeneration);
    return verified;
  }
}
