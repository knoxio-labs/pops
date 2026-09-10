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
import { isOk, pillar, type PillarHandle } from '@pops/pillar-sdk/server';

import {
  credentialled,
  credentialRejectedMessage,
  NO_CREDENTIAL_REASON,
  UNAUTHORIZED_REASON,
} from '../pillars/outbound.js';
import {
  classifyContactsFailureKind,
  CONTACTS_PILLAR_ID,
  fetchByExactName,
  fetchOneEntity,
  MAX_PAGES,
  pageThroughEntities,
} from './entity-fetch.js';
import { ContactsPermanentError, ContactsUnavailableError } from './errors.js';

import type {
  ContactEntity,
  ContactEntitySummary,
  ContactsClient,
  CreateOrFetchResult,
  ListResponse,
} from './types.js';

export type {
  ContactEntity,
  ContactEntitySummary,
  ContactsClient,
  CreateOrFetchResult,
  ListResponse,
} from './types.js';

export { ContactsPermanentError, ContactsUnavailableError } from './errors.js';

export { CONTACTS_PILLAR_ID } from './entity-fetch.js';

/**
 * Typed handle over the subset of the contacts router the finance backend
 * calls. Declared as a `type` (not `interface`) so it satisfies the SDK proxy's
 * `Record<string, unknown>` constraint — an interface does not (see the same
 * note in the orchestrator's `PillarSearchRouter`). Exported for unit tests
 * that drive `createContactsClient` against a stub handle. Declared here
 * rather than in `./types.js`: the cross-pillar-expectations guard resolves
 * a `pillar<T>(...)` call site's operations from `T`'s declaration in the
 * SAME file as the call.
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
    update: (input: {
      id: string;
      defaultTags: string[];
    }) => Promise<{ data: ContactEntity; message: string }>;
  };
};

/** Operation label carried in the error message of a failed defaults write. */
const UPDATE_OPERATION = 'entity defaultTags update';

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
    // The producer is spelled out rather than passed `CONTACTS_PILLAR_ID`:
    // the cross-pillar-expectations guard resolves a `pillar<T>(...)` call's
    // producer from a literal or from a `const` bound in the SAME file, and
    // that binding now lives next door (ADR-045).
    credentialled(CONTACTS_PILLAR_ID, () => pillar<ContactsRouter>('contacts')),
  options: ContactsClientOptions = {}
): ContactsClient {
  const maxPages = options.maxPages ?? MAX_PAGES;
  return {
    fetchAllEntities(query: { search?: string; type?: string } = {}): Promise<ContactEntity[]> {
      return pageThroughEntities(handleFactory(), query, maxPages);
    },

    async fetchEntityDefaultTags(entityId: string): Promise<string[]> {
      return (await fetchOneEntity(handleFactory(), entityId))?.defaultTags ?? [];
    },

    async fetchEntityDisplayName(entityId: string): Promise<string | null> {
      return (await fetchOneEntity(handleFactory(), entityId))?.name ?? null;
    },

    async fetchEntitySummary(entityId: string): Promise<ContactEntitySummary | null> {
      const entity = await fetchOneEntity(handleFactory(), entityId);
      if (entity === null) return null;
      return { name: entity.name, colour: entity.colour, avatarAssetId: entity.avatarAssetId };
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
      if (classifyContactsFailureKind(created.kind) === 'permanent') {
        if (created.kind === UNAUTHORIZED_REASON) {
          console.error(credentialRejectedMessage(CONTACTS_PILLAR_ID, 'entities.create'));
        }
        throw new ContactsPermanentError(created.kind);
      }
      throw new ContactsUnavailableError(created.kind);
    },

    updateDefaultTags(entityId: string, defaultTags: string[]): Promise<ContactEntity> {
      return patchDefaultTags(handleFactory(), entityId, defaultTags);
    },
  };
}

/**
 * The `updateDefaultTags` body, lifted out of the client factory so the
 * factory stays a thin table of methods. Never degrades to a silent no-op:
 * every non-ok result throws, split TRANSIENT/PERMANENT the same way
 * `createOrFetchByName` splits a failed create.
 */
async function patchDefaultTags(
  handle: PillarHandle<ContactsRouter> | null,
  entityId: string,
  defaultTags: string[]
): Promise<ContactEntity> {
  if (handle === null) {
    throw new ContactsUnavailableError(NO_CREDENTIAL_REASON, UPDATE_OPERATION);
  }
  const result = await handle.entities.update({ id: entityId, defaultTags });
  if (isOk(result)) return result.value.data;
  // A duplicate-name 409 cannot arise from a defaultTags-only patch, so
  // `conflict` here means contacts refused for a reason retrying will not
  // fix — classify it with the permanent arm rather than inventing a
  // create-style re-fetch that has nothing to resolve.
  if (result.kind === 'conflict' || classifyContactsFailureKind(result.kind) === 'permanent') {
    if (result.kind === UNAUTHORIZED_REASON) {
      console.error(credentialRejectedMessage(CONTACTS_PILLAR_ID, 'entities.update'));
    }
    throw new ContactsPermanentError(result.kind, UPDATE_OPERATION);
  }
  throw new ContactsUnavailableError(result.kind, UPDATE_OPERATION);
}
