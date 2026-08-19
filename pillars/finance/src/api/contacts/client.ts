/**
 * Live contacts-pillar client for the finance backend.
 *
 * Finance holds no local `entities` mirror. The import matcher and the
 * entity-usage rollup fetch the contact set from the contacts pillar over the
 * pillar SDK at request time and join/match it in memory for that run only —
 * no persistent copy.
 *
 * The whole set is fetched via a paginated `entities.list` sweep (the list cap
 * is per-page, so the client pages until exhausted). One bulk read serves all
 * three consumers: the matcher reads name/aliases, the usage rollup reads the
 * full attributes, and the tag-suggester reads `defaultTags`.
 *
 * All reads degrade gracefully: when contacts is unreachable the SDK returns a
 * `CallResult` whose `kind !== 'ok'` and the helpers substitute an EMPTY set
 * plus a logged warning rather than throwing — an import does a no-match run
 * and the usage list renders empty. The pre-create path is
 * create-or-fetch-by-name: it fetches by name FIRST (case-insensitively) and
 * only creates when absent, then tolerates a 409 dup-name from a concurrent
 * create — so a retry after a rolled-back finance transaction reuses the
 * contact. The fetch-first step gives a clean `created: false` reuse and a
 * stable id without depending on a 409 round-trip; contacts itself enforces
 * name uniqueness case-INSENSITIVELY (`WHERE name COLLATE NOCASE = ?`), so the
 * 409 fallback is the backstop for a genuine concurrent insert. A `create`
 * failure that ISN'T a 409 is split into two error kinds so a caller can react
 * differently: `unavailable`/`degraded`/`rate-limited` throw
 * {@link ContactsUnavailableError} (TRANSIENT — retry later, `rate-limited` on
 * the producer's own schedule), while `bad-request`/`unauthorized`/
 * `contract-mismatch`/`not-found`/`refused` throw {@link ContactsPermanentError}
 * (PERMANENT — retrying the same input never helps).
 *
 * `/server`, not `/client` (POPS-2021). The handle is built through
 * {@link credentialled} from `../pillars/outbound.js`, which attaches this
 * pillar's service-account key as `X-API-Key` and answers `null` instead of
 * throwing when this process holds none — every read then degrades exactly
 * as it does against an unreachable contacts, and `createOrFetchByName`
 * throws the same TRANSIENT {@link ContactsUnavailableError} a real outage
 * would. A callee-refused credential (`kind === 'unauthorized'`) is logged
 * distinctly via {@link credentialRejectedMessage} rather than folded into
 * the generic "degraded" warning, because it will not clear on retry the way
 * an outage does.
 */
import { isOk, pillar, type CallResult, type PillarHandle } from '@pops/pillar-sdk/server';

import {
  credentialled,
  credentialRejectedMessage,
  NO_CREDENTIAL_REASON,
  UNAUTHORIZED_REASON,
} from '../pillars/outbound.js';

/** The contacts pillar id, as registered with the registry. */
export const CONTACTS_PILLAR_ID = 'contacts';

/** A full contact, mirroring the contacts `Entity` wire shape (no notion/owner columns). */
export interface ContactEntity {
  id: string;
  name: string;
  type: string;
  abn: string | null;
  aliases: string[];
  defaultTransactionType: string | null;
  defaultTags: string[];
  notes: string | null;
  lastEditedTime: string;
}

/** The contacts `entities.list` envelope (page of contacts + pagination cursor). */
export interface ListResponse {
  data: ContactEntity[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
}

/**
 * Typed handle over the subset of the contacts router the finance backend
 * calls. Declared as a `type` (not `interface`) so it satisfies the SDK proxy's
 * `Record<string, unknown>` constraint — an interface does not (see the same
 * note in the orchestrator's `PillarSearchRouter`). Exported for unit tests
 * that drive `createContactsClient` against a stub handle.
 */
export type ContactsRouter = {
  entities: {
    list: (input: {
      search?: string;
      type?: string;
      limit?: number;
      offset?: number;
    }) => Promise<ListResponse>;
    get: (input: { id: string }) => Promise<{ data: ContactEntity }>;
    create: (input: {
      name: string;
      type: string;
    }) => Promise<{ data: ContactEntity; message: string }>;
  };
};

/** Outcome of a create-or-fetch-by-name pre-create against contacts. */
export interface CreateOrFetchResult {
  id: string;
  name: string;
  /** True only when this call inserted a NEW contact; false when it reused an existing one. */
  created: boolean;
}

/**
 * The injectable seam every finance live-fetch path depends on. The default
 * impl is backed by `pillar('contacts')`; tests pass a fake so the matcher /
 * usage join / degradation paths are exercised without the network.
 */
export interface ContactsClient {
  /**
   * The whole contact set (optionally filtered by `search`/`type`), paged out
   * of the contacts list endpoint. Empty when contacts is down.
   */
  fetchAllEntities(query?: { search?: string; type?: string }): Promise<ContactEntity[]>;
  /**
   * The `defaultTags` of a single contact (the tag-suggester entity source for
   * the per-transaction suggest endpoint). Empty when the id is unknown or
   * contacts is down — the entity stage simply contributes nothing.
   */
  fetchEntityDefaultTags(entityId: string): Promise<string[]>;
  /**
   * Resolve a contact for `name`, creating it only when absent. Fetches by
   * (case-insensitive) name FIRST, creates when none matches, and tolerates a
   * 409 from a racing concurrent create by re-fetching. `created` reports
   * whether THIS call inserted a new contact. Never resolves silently on
   * failure: a TRANSIENT failure (contacts unreachable / mid-recovery /
   * rate-limited) throws {@link ContactsUnavailableError}; a PERMANENT one
   * (malformed request, auth, contract mismatch, an unrecognised refusal)
   * throws {@link ContactsPermanentError}. `commitImport`
   * (issue #3683) is the one caller that catches `ContactsUnavailableError`
   * specifically and degrades to a `pending:contact:{uuid}` placeholder + an
   * outbox row instead of aborting; `ContactsPermanentError` and every other
   * caller still let the failure propagate and abort.
   */
  createOrFetchByName(name: string, type: string): Promise<CreateOrFetchResult>;
}

/**
 * Thrown when a contact pre-create fails for a reason expected to clear on
 * retry — contacts unreachable, mid-recovery (`degraded`), or rate-limited
 * (`rate-limited`, 429). The ONE failure mode `commitImport` degrades to an
 * outbox row instead of aborting; retrying the same `{ name, type }` later is
 * expected to eventually succeed.
 */
export class ContactsUnavailableError extends Error {
  override readonly name = 'ContactsUnavailableError';
  constructor(detail: string) {
    super(`contacts pillar unavailable during entity pre-create: ${detail}`);
  }
}

/**
 * Thrown when a contact pre-create fails for a reason retrying will NEVER
 * fix — a malformed request, an auth failure, or an SDK/contacts contract
 * mismatch. Retrying `createOrFetchByName` with the same `{ name, type }`
 * would fail identically forever, so this must abort the commit loudly
 * rather than degrade to the outbox the way {@link ContactsUnavailableError}
 * does.
 */
export class ContactsPermanentError extends Error {
  override readonly name = 'ContactsPermanentError';
  constructor(detail: string) {
    super(`contacts pillar rejected entity pre-create: ${detail}`);
  }
}

/** The non-ok, non-conflict `create` result kinds this classifier sorts. */
type CreateFailureKind = Exclude<CallResult<unknown>['kind'], 'ok' | 'conflict'>;

/**
 * TRANSIENT vs PERMANENT for every non-ok/non-conflict `create` result kind.
 *
 * A total switch with no default arm, matching `toGatewayFailure` and
 * `upstream-error.ts`'s `classify`: a kind added to {@link CallResult} that
 * is not listed in one of these two arms fails the build here rather than
 * being silently absorbed by a catch-all negation. `rate-limited` (429) is
 * TRANSIENT — the producer is asking for a retry on its own schedule, not
 * refusing the request — so it degrades to the outbox exactly like
 * `unavailable`/`degraded` rather than aborting the commit.
 */
function classifyCreateFailureKind(kind: CreateFailureKind): 'transient' | 'permanent' {
  switch (kind) {
    case 'unavailable':
    case 'degraded':
    case 'rate-limited':
      return 'transient';
    case 'not-found':
    case 'contract-mismatch':
    case 'bad-request':
    case 'unauthorized':
    case 'refused':
      return 'permanent';
  }
}

/** Per-page size for the bulk list sweep — matches the contacts list `MAX_LIMIT`. */
const PAGE_SIZE = 200;
/**
 * Safety cap on the paging sweep: a backstop against a runaway loop on a
 * misbehaving peer, NOT a dataset cap. At `PAGE_SIZE` per page this is 1M
 * contacts — comfortably above any personal dataset. The matcher needs the
 * FULL set, so hitting this cap is treated as a visible truncation (warned),
 * never a silent partial fetch.
 */
const MAX_PAGES = 5000;

function warnDegraded(operation: string, result: CallResult<unknown>): void {
  if (isOk(result)) return;
  if (result.kind === UNAUTHORIZED_REASON) {
    console.error(credentialRejectedMessage(CONTACTS_PILLAR_ID, operation));
    return;
  }
  console.warn(
    `[contacts] ${operation} degraded (kind=${result.kind}); substituting empty contact set`
  );
}

async function pageThroughEntities(
  handle: PillarHandle<ContactsRouter> | null,
  query: { search?: string; type?: string },
  maxPages: number
): Promise<ContactEntity[]> {
  // `credentialled()` already logged the no-key case once for this
  // process; nothing else to say here beyond substituting the same empty
  // set a real outage would.
  if (handle === null) return [];
  const all: ContactEntity[] = [];
  for (let page = 0; page < maxPages; page++) {
    const result = await handle.entities.list({
      search: query.search,
      type: query.type,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });
    if (!isOk(result)) {
      warnDegraded('entities.list', result);
      return [];
    }
    all.push(...result.value.data);
    if (!result.value.pagination.hasMore) return all;
  }
  console.warn(
    `[contacts] entities.list sweep hit the ${maxPages}-page safety cap with more rows ` +
      `still available — returning a TRUNCATED set of ${all.length} contacts; matches/usage ` +
      `for the tail will be missed`
  );
  return all;
}

/** Test-only knobs; production omits these and takes the module defaults. */
export interface ContactsClientOptions {
  /** Override the paging safety cap (default {@link MAX_PAGES}) for cap-behavior tests. */
  maxPages?: number;
}

/**
 * Build the default contacts client over the pillar SDK. `handleFactory` is
 * injectable purely so unit tests can supply a stub router; production
 * passes the real, credentialled `pillar('contacts')` — built fresh per
 * call, not once at construction, because `pillar()` from
 * `@pops/pillar-sdk/server` refuses to build a handle without a
 * service-account key and constructing eagerly would move a missing key
 * from a degraded client to a pillar that will not boot.
 */
export function createContactsClient(
  handleFactory: () => PillarHandle<ContactsRouter> | null = () =>
    credentialled(CONTACTS_PILLAR_ID, () => pillar<ContactsRouter>(CONTACTS_PILLAR_ID)),
  options: ContactsClientOptions = {}
): ContactsClient {
  const maxPages = options.maxPages ?? MAX_PAGES;
  return {
    fetchAllEntities(query: { search?: string; type?: string } = {}): Promise<ContactEntity[]> {
      return pageThroughEntities(handleFactory(), query, maxPages);
    },

    async fetchEntityDefaultTags(entityId: string): Promise<string[]> {
      const handle = handleFactory();
      if (handle === null) return [];
      const result = await handle.entities.get({ id: entityId });
      if (!isOk(result)) {
        if (result.kind !== 'not-found') warnDegraded('entities.get', result);
        return [];
      }
      return result.value.data.defaultTags;
    },

    async createOrFetchByName(name: string, type: string): Promise<CreateOrFetchResult> {
      const handle = handleFactory();
      if (handle === null) {
        throw new ContactsUnavailableError(NO_CREDENTIAL_REASON);
      }
      const preexisting = await fetchByExactName(handle, name, maxPages);
      if (preexisting) return { id: preexisting.id, name: preexisting.name, created: false };

      const created = await handle.entities.create({ name, type });
      if (isOk(created)) {
        return { id: created.value.data.id, name: created.value.data.name, created: true };
      }
      if (created.kind === 'conflict') {
        const raced = await fetchByExactName(handle, name, maxPages);
        if (raced) return { id: raced.id, name: raced.name, created: false };
        throw new ContactsUnavailableError(`409 for "${name}" but no existing contact found`);
      }
      if (classifyCreateFailureKind(created.kind) === 'permanent') {
        if (created.kind === UNAUTHORIZED_REASON) {
          console.error(credentialRejectedMessage(CONTACTS_PILLAR_ID, 'entities.create'));
        }
        throw new ContactsPermanentError(created.kind);
      }
      throw new ContactsUnavailableError(created.kind);
    },
  };
}

/**
 * Resolve a single contact by exact (case-insensitive) name. The list `search`
 * is a substring filter, so the exact match is re-checked client-side over the
 * matching page. Backs the fetch-first leg of create-or-fetch, returning the
 * existing contact for reuse before any create is attempted.
 */
async function fetchByExactName(
  handle: PillarHandle<ContactsRouter>,
  name: string,
  maxPages: number
): Promise<ContactEntity | null> {
  const matches = await pageThroughEntities(handle, { search: name }, maxPages);
  const target = name.toLowerCase();
  return matches.find((e) => e.name.toLowerCase() === target) ?? null;
}
