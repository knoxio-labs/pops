/**
 * Cross-pillar client for the lists pillar — send-to-list writes shopping-list
 * items over the `@pops/pillar-sdk` proxy, which discovers the lists pillar
 * through the registry and resolves each call against the operation ids in
 * the contract lists publishes (ADR-040).
 *
 * Each call is its own atomic operation on the lists side; lists owns its own
 * consistency, so there is no single cross-pillar transaction. `upsertByRef`
 * makes the merge-or-insert atomic per item so retries are idempotent.
 */
import { isOk, pillar, type CallResult, type PillarHandle } from '@pops/pillar-sdk/client';

/** The lists pillar id, as registered with the registry. */
export const LISTS_PILLAR_ID = 'lists';

export interface ListHeader {
  id: number;
  kind: string;
  ownerApp: string;
  archivedAt: string | null;
}

export type UpsertRefKind = 'ingredient' | 'variant' | 'recipe' | 'custom';
export type UpsertConflictMode = 'merge-additive' | 'replace' | 'skip';

export interface UpsertByRefBody {
  refKind: UpsertRefKind;
  refId: number;
  label: string;
  qty?: number | null;
  unit?: string | null;
  notes?: string | null;
  onConflict?: UpsertConflictMode;
}

export interface UpsertByRefResult {
  outcome: 'inserted' | 'merged' | 'skipped';
  itemId: number;
}

export interface AddItemBody {
  label: string;
  qty?: number | null;
  unit?: string | null;
  refKind?: string;
  refId?: number | null;
  notes?: string | null;
}

export interface ListsClient {
  getList(id: number): Promise<ListHeader | null>;
  createShoppingList(name: string): Promise<number>;
  upsertByRef(listId: number, body: UpsertByRefBody): Promise<UpsertByRefResult>;
  addItem(listId: number, body: AddItemBody): Promise<void>;
  /** Distinct shopping-list ids whose item notes contain `notesContains`. */
  searchShoppingListIdsByNotes(notesContains: string): Promise<number[]>;
}

/**
 * Typed handle over the subset of the lists router send-to-list calls.
 * Declared as a `type` (not `interface`) so it satisfies the SDK proxy's
 * `Record<string, unknown>` constraint. Exported for tests that drive
 * {@link createListsClient} against a stub handle.
 *
 * `list.get` answers `null` for a list that does not exist — lists returns a
 * 200 with a null body there rather than a 404, so the absent case is a value
 * this client has to read, not a status it can branch on.
 */
export type ListsRouter = {
  list: {
    get: (input: { id: number }) => Promise<{ list: ListHeader } | null>;
    create: (input: { name: string; kind: string; ownerApp: string }) => Promise<{ id: number }>;
  };
  items: {
    add: (input: { listId: number } & AddItemBody) => Promise<{ id: number; position: number }>;
    upsertByRef: (input: { listId: number } & UpsertByRefBody) => Promise<UpsertByRefResult>;
    search: (input: {
      kind: string;
      notesContains: string;
    }) => Promise<{ items: { listId: number }[] }>;
  };
};

/**
 * Thrown when lists answers something other than success. Send-to-list has no
 * degraded mode — a half-written shopping list is worse than a failed request —
 * so every non-ok result aborts the operation the way the HTTP client it
 * replaced did.
 */
export class ListsCallError extends Error {
  override readonly name = 'ListsCallError';
  readonly operation: string;
  readonly kind: string;

  constructor(operation: string, result: Exclude<CallResult<unknown>, { kind: 'ok' }>) {
    const detail = 'message' in result && result.message ? `: ${result.message}` : '';
    super(`lists ${operation} failed (${result.kind})${detail}`);
    this.operation = operation;
    this.kind = result.kind;
  }
}

function unwrap<T>(operation: string, result: CallResult<T>): T {
  if (isOk(result)) return result.value;
  throw new ListsCallError(operation, result);
}

/**
 * Build the lists client over the pillar SDK. `handleFactory` is injectable
 * purely so unit tests can supply a stub router; production passes the real
 * `pillar('lists')`.
 */
export function createListsClient(
  handleFactory: () => PillarHandle<ListsRouter> = () => pillar<ListsRouter>(LISTS_PILLAR_ID)
): ListsClient {
  return {
    async getList(id) {
      const result = await handleFactory().list.get({ id });
      if (result.kind === 'not-found') return null;
      return unwrap('list.get', result)?.list ?? null;
    },

    async createShoppingList(name) {
      const result = await handleFactory().list.create({
        name,
        kind: 'shopping',
        ownerApp: 'food',
      });
      return unwrap('list.create', result).id;
    },

    async upsertByRef(listId, body) {
      return unwrap(
        'items.upsertByRef',
        await handleFactory().items.upsertByRef({ listId, ...body })
      );
    },

    async addItem(listId, body) {
      unwrap('items.add', await handleFactory().items.add({ listId, ...body }));
    },

    async searchShoppingListIdsByNotes(notesContains) {
      const page = unwrap(
        'items.search',
        await handleFactory().items.search({ kind: 'shopping', notesContains })
      );
      const ids = new Set(page.items.map((i) => i.listId));
      return [...ids].toSorted((a, b) => a - b);
    },
  };
}
