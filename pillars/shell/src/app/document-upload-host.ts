import { DocumentUploadHostState } from './document-upload-host-state';
import { DocumentUploadHostVerification } from './document-upload-host-verification';

import type { DocumentUploadHostOptions, ShellUploadHost } from './document-upload-host-types';

export type { DocumentUploadHostOptions, ShellUploadHost } from './document-upload-host-types';

/** Verify Registry identity freshly and expose only account/server/epoch-scoped metadata leases. */
export function createDocumentUploadHost(options: DocumentUploadHostOptions = {}): ShellUploadHost {
  const state = new DocumentUploadHostState(options);
  const verification = new DocumentUploadHostVerification(state);
  return {
    verify: () => verification.verify('lifecycle'),
    current: () => (state.active?.isCurrent() ? state.active : null),
    problem: () => state.problem,
    invalidate: () => state.invalidate(),
    subscribe: (listener) => state.subscribe(listener),
    handleStorageEvent: (event) => state.handleStorageEvent(event),
  };
}
