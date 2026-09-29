import type { CallResult } from '@pops/pillar-sdk/server';

/** Records the id supplied to the fake targeted-item procedure. */
export interface InventoryItemCall {
  id?: string;
}

/** Configures the responses exposed by the inventory pillar fake. */
export interface InventoryFakeOptions {
  /** What `sync.snapshot` answers. Defaults to an empty, fully-drained page. */
  snapshotResult?: CallResult<unknown>;
  /** What `sync.changes` answers. */
  changesResult?: CallResult<unknown>;
  /**
   * What `sync.itemEvents` answers, per item id. An id absent from the map
   * answers the producer's own not-found shape.
   */
  itemEventsResult?: Readonly<Record<string, CallResult<unknown>>>;
  /** What `sync.item` answers, per item id. */
  itemResult?: Readonly<Record<string, CallResult<unknown>>>;
  /** What `types.catalogue` answers. */
  catalogueResult?: CallResult<unknown>;
  /** What `types.read.catalogue` answers for each requested revision. */
  catalogueRevisionResult?: (revision: number) => CallResult<unknown>;
  /** What `sync.mutations` answers. Defaults to one `applied` outcome per mutation sent. */
  mutationsResult?: (input: unknown) => CallResult<unknown>;
  /** What `sync.reportLedger` answers. Defaults to `{ stored: true }`. */
  ledgerResult?: CallResult<unknown>;
  /** What `codes.suggest` answers. */
  suggestResult?: CallResult<unknown>;
}
