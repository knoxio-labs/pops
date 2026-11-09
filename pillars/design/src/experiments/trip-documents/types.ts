import type {
  DocumentLink,
  DocumentLinkingState,
  DocumentRecord,
  DocumentTarget,
} from '../trip-document-linking/model';

/** Exact route visit metadata; recurrent visits retain distinct identities and independent dates. */
export interface DocumentVisit {
  id: string;
  name: string;
  from: string;
  to: string;
}

/** An explicit association between a target and a route visit, independent of target labels or identifiers. */
export interface DocumentTargetVisit {
  id: string;
  targetId: string;
  visitId: string;
}

/** Recorded fictional offline evidence, independent of online source availability or actual browser downloads. */
export interface DocumentOfflineFact {
  documentId: string;
  status: 'ready' | 'not-downloaded' | 'stale' | 'failed';
  source: string;
  detail: string;
  recordedAt?: string;
}

/** Original source provenance; a missing URL does not imply that a preview or download exists. */
export interface DocumentProvenance {
  documentId: string;
  source: string;
  url?: string;
}

/** Original metadata, independent reference associations and actual pending File objects in the approved linker state. */
export interface TripDocumentsState {
  linking: DocumentLinkingState;
  visits: DocumentVisit[];
  targetVisits: DocumentTargetVisit[];
  offline: DocumentOfflineFact[];
  provenance: DocumentProvenance[];
}

/** Explicit source and offline filters; an unrecorded fact remains unknown. */
export interface TripDocumentFilters {
  query: string;
  mimeType: string;
  source: 'all' | 'available' | 'unavailable' | 'unknown';
  offline: 'all' | DocumentOfflineFact['status'] | 'unknown';
}

/** One row per original source identity, including an explicit unresolved identity referenced by a link. */
export interface DocumentRow {
  id: string;
  document?: DocumentRecord;
  title: string;
  links: DocumentLink[];
  offline?: DocumentOfflineFact;
  provenance?: DocumentProvenance;
}

/** A reference occurrence to the same original row; repeated occurrences never become document copies. */
export interface TripDocumentOccurrence {
  id: string;
  row: DocumentRow;
  link: DocumentLink;
  target?: DocumentTarget;
  visitId: string;
  visitLabel: string;
}

/** Fictional ledger review scenarios. */
export type TripDocumentsScenario =
  | 'default'
  | 'empty'
  | 'unavailable'
  | 'missing-reference'
  | 'duplicate-names'
  | 'offline';
