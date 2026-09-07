/** The server's own `kind` filter, plus the unfiltered case the UI adds. */
export type QueueKind = 'proposed' | 'unexplained';

export interface QueueFilterState {
  readonly kind: QueueKind | 'all';
  readonly includeAuto: boolean;
}

export const DEFAULT_QUEUE_FILTERS: QueueFilterState = { kind: 'all', includeAuto: false };

/** What a keypress or a toolbar button asks for. */
export type DecisionKind = 'accept' | 'reject';
