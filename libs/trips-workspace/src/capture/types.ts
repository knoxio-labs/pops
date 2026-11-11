import type { ContactsHostCapability } from '@pops/pillar-sdk';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { Client } from '../trips-api/client';
import type {
  CaptureWorkspaceGetResponses,
  CapturesCreateData,
  CapturesCreateResponses,
  CapturesUpdateData,
  CapturesAttachData,
  CapturesRemoveData,
  CapturesOrganiseData,
  CapturesRemoveAssociationData,
  IdeasCreateData,
  IdeasUpdateData,
  IdeasRemoveData,
  ExploreAddData,
  ExploreRemoveData,
} from '../trips-api/types.gen';

/** One transactionally consistent source workspace from the Trips producer. */
export type CaptureSource = CaptureWorkspaceGetResponses[200];
/** A source capture keeps its own identity after organisation. */
export type Capture = CaptureSource['captures'][number];
/** Exact persisted source to edit; kind distinguishes colliding Capture and Idea IDs. */
export type CaptureSourceSelection =
  | { kind: 'capture'; id: Capture['id'] }
  | { kind: 'idea'; id: CaptureSource['ideas'][number]['id'] };
/** Accepted Documents task/original identity; never a browser File serialization. */
export type CaptureAttachment = Capture['attachments'][number];
/** Explicit organisation input from the published producer, without inferred source fields. */
export type CaptureTargetInput = NonNullable<CapturesCreateData['body']>['command']['target'];
/** Finite scoped source mutations from the generated owner contract. */
export type CaptureCommand = NonNullable<
  | CapturesCreateData['body']
  | CapturesUpdateData['body']
  | CapturesAttachData['body']
  | CapturesRemoveData['body']
  | CapturesOrganiseData['body']
  | CapturesRemoveAssociationData['body']
  | IdeasCreateData['body']
  | IdeasUpdateData['body']
  | IdeasRemoveData['body']
  | ExploreAddData['body']
  | ExploreRemoveData['body']
>['command'];
/** Durable original outcome and current affected rows returned separately by Trips. */
export type CaptureResult = CapturesCreateResponses[200];
/** Owner-issued operation UUID and exact canonical source intent, retained for retry. */
export interface CaptureOperation {
  operationId: string;
  command: CaptureCommand;
}
/** Scope used to reverse only the matching resource's owned operation. */
export type CaptureUndoScope = 'capture' | 'idea' | 'explore';
/** A selected original has a distinct session identity even when names coincide. */
export interface CaptureSelection {
  id: string;
  file: File | null;
  name: string;
  mediaType: string | null;
  references: readonly CaptureAttachment[];
}
/** Verbatim composer material and explicit optional selections; Files exist only in this session. */
export interface CaptureDraft {
  originalText: string;
  originalUrl: string;
  classification: Capture['classification'];
  placeId: number | null;
  visitId: number | null;
  selections: readonly CaptureSelection[];
  target: CaptureTargetInput;
  explore: boolean;
}
/** Host-owned authenticated transport and owning trip identity. */
export interface CaptureIdentity {
  tripId: number;
  client?: Client;
}
/** Explicit operation or guarded resource inverse; retries retain this same request. */
export type CaptureRequest =
  | CaptureOperation
  | {
      operationId: string;
      command: { kind: 'undo'; targetOperationId: string };
      scope: CaptureUndoScope;
    };
/** Injected owner transport used by the headless editor and its integration tests. */
export type CapturePerformer = (request: CaptureRequest) => Promise<CaptureResult>;
/** Approved source surfaces share one browser session for an owning trip. */
export interface CaptureWorkspaceProps extends CaptureIdentity {
  view: 'capture' | 'inbox' | 'explore';
  /** Edit only this exact active source; undefined/null show the ordinary tool view, never a fallback source. */
  selectedSource?: CaptureSourceSelection | null;
  /** Optional host-owned Contacts chooser and reader; absent capabilities leave retained references unverified. */
  contacts?: ContactsHostCapability;
  documentsClient?: DocumentsClient;
  onViewEvent?: (eventId: number) => void;
}
