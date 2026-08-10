/**
 * Cross-pillar enrichment clients for semantic-search metadata resolution.
 *
 * The transaction / movie / tv-show / inventory tables live in their owning
 * pillars, so enrichment for cross-pillar source types is fetched from each
 * owner through the `@pops/pillar-sdk` proxy: the registry answers where the
 * peer is, and each call resolves against an operation id in the contract that
 * peer publishes (ADR-040).
 *
 * Each peer endpoint returns `{ data: Schema }`. We hand-type a minimal shape
 * per peer (only the fields the formatters use) rather than importing the
 * peers' generated `api-types` — that would couple cerebrum's build to the
 * peers' `dist/` artifacts for four scalar fields.
 *
 * Absence is a per-call outcome, not a boot-time one: a peer that is not
 * registered answers `unavailable`, which throws and is caught by the hybrid
 * fallback, while a row the peer does not have answers `not-found` and yields
 * `null` metadata (unresolvable domain row → the hit is dropped). The
 * {@link PeerClients} members stay optional so a caller — every test does
 * this — can still supply a subset.
 */
import { isOk, pillar, type CallResult, type PillarHandle } from '@pops/pillar-sdk/client';

/** Peer pillar ids, as registered with the registry. */
export const FINANCE_PILLAR_ID = 'finance';
export const MEDIA_PILLAR_ID = 'media';
export const INVENTORY_PILLAR_ID = 'inventory';

export interface FinanceTransactionRow {
  description?: string | null;
  entityName?: string | null;
  tags?: string[] | null;
  notes?: string | null;
}

export interface MediaMovieRow {
  title?: string | null;
  overview?: string | null;
  genres?: string[] | null;
}

export interface MediaTvShowRow {
  name?: string | null;
  overview?: string | null;
  genres?: string[] | null;
}

export interface InventoryItemRow {
  itemName?: string | null;
  brand?: string | null;
  type?: string | null;
  location?: string | null;
}

/** A page of rows returned by a peer LIST endpoint (`{ data, pagination }`). */
export interface PeerPage<T> {
  rows: T[];
  hasMore: boolean;
}

/**
 * Cross-source scan rows carry the owning-pillar primary key alongside the
 * formatter fields. The thalamus cross-source indexer pages through these to
 * enqueue embedding jobs for changed rows.
 */
export interface FinanceTransactionListRow extends FinanceTransactionRow {
  id: string;
}
export interface MediaMovieListRow extends MediaMovieRow {
  id: number;
}
export interface MediaTvShowListRow extends MediaTvShowRow {
  id: number;
}
export interface InventoryItemListRow extends InventoryItemRow {
  id: string;
}

export interface PeerClients {
  finance?: {
    getTransaction(id: string): Promise<FinanceTransactionRow | null>;
    listTransactions(limit: number, offset: number): Promise<PeerPage<FinanceTransactionListRow>>;
  };
  media?: {
    getMovie(id: number): Promise<MediaMovieRow | null>;
    getTvShow(id: number): Promise<MediaTvShowRow | null>;
    listMovies(limit: number, offset: number): Promise<PeerPage<MediaMovieListRow>>;
    listTvShows(limit: number, offset: number): Promise<PeerPage<MediaTvShowListRow>>;
  };
  inventory?: {
    getItem(id: string): Promise<InventoryItemRow | null>;
    listItems(limit: number, offset: number): Promise<PeerPage<InventoryItemListRow>>;
  };
}

/** The `{ data, pagination }` envelope every peer LIST endpoint answers with. */
interface PeerPageEnvelope<T> {
  data?: T[];
  pagination?: { hasMore?: boolean };
}

/** The `{ data }` envelope every peer GET endpoint answers with. */
interface PeerRowEnvelope<T> {
  data?: T;
}

/** The paging window every peer LIST endpoint accepts. */
interface PeerPageInput {
  limit: number;
  offset: number;
}

/**
 * Typed handles over the subset of each peer's router cerebrum calls. Declared
 * as `type`s (not `interface`s) so they satisfy the SDK proxy's
 * `Record<string, unknown>` constraint. Exported for tests that drive
 * {@link createPeerClients} against stub handles.
 */
export type FinanceRouter = {
  transactions: {
    get: (input: { id: string }) => Promise<PeerRowEnvelope<FinanceTransactionRow>>;
    list: (input: PeerPageInput) => Promise<PeerPageEnvelope<FinanceTransactionListRow>>;
  };
};

export type MediaRouter = {
  movies: {
    get: (input: { id: number }) => Promise<PeerRowEnvelope<MediaMovieRow>>;
    list: (input: PeerPageInput) => Promise<PeerPageEnvelope<MediaMovieListRow>>;
  };
  tvShows: {
    get: (input: { id: number }) => Promise<PeerRowEnvelope<MediaTvShowRow>>;
    list: (input: PeerPageInput) => Promise<PeerPageEnvelope<MediaTvShowListRow>>;
  };
};

export type InventoryRouter = {
  items: {
    get: (input: { id: string }) => Promise<PeerRowEnvelope<InventoryItemRow>>;
    list: (input: PeerPageInput) => Promise<PeerPageEnvelope<InventoryItemListRow>>;
  };
};

/**
 * Thrown when a peer answers something other than success or `not-found`.
 * Enrichment must not turn a peer outage into "this row has no metadata": the
 * caller distinguishes an unresolvable row (`null`) from a peer that could not
 * answer, and folds the latter into the hybrid keyword fallback.
 */
export class PeerCallError extends Error {
  override readonly name = 'PeerCallError';
  readonly operation: string;
  readonly kind: string;

  constructor(operation: string, result: Exclude<CallResult<unknown>, { kind: 'ok' }>) {
    const detail = 'message' in result && result.message ? `: ${result.message}` : '';
    super(`${operation} failed (${result.kind})${detail}`);
    this.operation = operation;
    this.kind = result.kind;
  }
}

function readRow<T>(operation: string, result: CallResult<PeerRowEnvelope<T>>): T | null {
  if (result.kind === 'not-found') return null;
  if (!isOk(result)) throw new PeerCallError(operation, result);
  return result.value.data ?? null;
}

function readPage<T>(operation: string, result: CallResult<PeerPageEnvelope<T>>): PeerPage<T> {
  if (result.kind === 'not-found') return { rows: [], hasMore: false };
  if (!isOk(result)) throw new PeerCallError(operation, result);
  return { rows: result.value.data ?? [], hasMore: result.value.pagination?.hasMore ?? false };
}

function buildFinanceClient(handle: () => PillarHandle<FinanceRouter>): PeerClients['finance'] {
  return {
    async getTransaction(id) {
      return readRow('finance transactions.get', await handle().transactions.get({ id }));
    },
    async listTransactions(limit, offset) {
      return readPage(
        'finance transactions.list',
        await handle().transactions.list({ limit, offset })
      );
    },
  };
}

function buildMediaClient(handle: () => PillarHandle<MediaRouter>): PeerClients['media'] {
  return {
    async getMovie(id) {
      return readRow('media movies.get', await handle().movies.get({ id }));
    },
    async getTvShow(id) {
      return readRow('media tvShows.get', await handle().tvShows.get({ id }));
    },
    async listMovies(limit, offset) {
      return readPage('media movies.list', await handle().movies.list({ limit, offset }));
    },
    async listTvShows(limit, offset) {
      return readPage('media tvShows.list', await handle().tvShows.list({ limit, offset }));
    },
  };
}

function buildInventoryClient(
  handle: () => PillarHandle<InventoryRouter>
): PeerClients['inventory'] {
  return {
    async getItem(id) {
      return readRow('inventory items.get', await handle().items.get({ id }));
    },
    async listItems(limit, offset) {
      return readPage('inventory items.list', await handle().items.list({ limit, offset }));
    },
  };
}

/**
 * Per-peer handle factories. Injectable purely so unit tests can supply stub
 * routers; production omits them and takes the real `pillar('<id>')`.
 */
export interface PeerHandleFactories {
  finance?: () => PillarHandle<FinanceRouter>;
  media?: () => PillarHandle<MediaRouter>;
  inventory?: () => PillarHandle<InventoryRouter>;
}

/** Build the cross-pillar enrichment clients over the pillar SDK. */
export function createPeerClients(factories: PeerHandleFactories = {}): PeerClients {
  return {
    finance: buildFinanceClient(
      factories.finance ?? (() => pillar<FinanceRouter>(FINANCE_PILLAR_ID))
    ),
    media: buildMediaClient(factories.media ?? (() => pillar<MediaRouter>(MEDIA_PILLAR_ID))),
    inventory: buildInventoryClient(
      factories.inventory ?? (() => pillar<InventoryRouter>(INVENTORY_PILLAR_ID))
    ),
  };
}
