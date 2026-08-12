/**
 * View types for the reconcile queue, derived from the generated client.
 *
 * Everything here is an alias into `purchases-api/types.gen.ts` rather than a
 * hand-written mirror: the queue's wire shape changes whenever the pillar's
 * contract does, and a mirror would keep compiling while rendering fields the
 * server no longer sends.
 */
import type { ReconcileQueueData, ReconcileQueueResponses } from '../../purchases-api/types.gen.js';

type QueuePayload = NonNullable<ReconcileQueueResponses[200]>;

/** One charge awaiting a decision, with everything the engine proposes for it. */
export type QueueEntry = QueuePayload['items'][number];

/** One unconfirmed link: a transaction the engine thinks settles the charge. */
export type ProposedLink = QueueEntry['proposed'][number];

export type LinkType = ProposedLink['linkType'];

/** The server's own `kind` filter, plus the unfiltered case the wire omits. */
export type QueueKind = NonNullable<NonNullable<ReconcileQueueData['query']>['kind']>;

export interface QueueFilterState {
  readonly kind: QueueKind | 'all';
  readonly includeAuto: boolean;
}

export const DEFAULT_QUEUE_FILTERS: QueueFilterState = { kind: 'all', includeAuto: false };

/** What a keypress or a toolbar button asks for. */
export type DecisionKind = 'accept' | 'reject';
