/**
 * bfm's contacts leg: naming the entities a page of purchases already
 * carries an id for (POPS-3634), and — for the review form's merchant and
 * address pickers (POPS-3753, ADR-053) — searching, reading and creating a
 * merchant, and a merchant's recorded addresses.
 *
 * The purchases pillar never resolves a merchant's DISPLAY name at read
 * time — `merchantEntityId` is the operative fact, `merchantEntityName` is
 * only the till's own wording, and `GET /purchases` gains no new outbound
 * dependency to bridge the two (POPS-3634's recorded decision,
 * `purchases/list-wire.ts`'s docstring). bfm already reads across pillars
 * for every other mobile surface, so it resolves the name itself, batched:
 * one `entities.lookup` call answers every distinct entity id a page of
 * purchases carries, never one call per row — narrowed server-side by
 * `contacts`' `ids` filter (POPS-3925), never by fetching its whole match
 * set and discarding most of it here.
 *
 * Like the other legs, every call goes through the {@link PillarGateway}, so
 * a half-broken federation arrives as a value with a kind rather than an
 * exception. A lookup that fails costs a resolved NAME, never the purchase
 * itself or its `entityId` — the caller degrades to an empty result rather
 * than failing the page.
 */
import { isGatewayOk, type GatewayOutcome, type PillarGateway } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import {
  ContactsAddressListResponseSchema,
  ContactsAddressMutationResponseSchema,
  ContactsLookupResponseSchema,
  ContactsMerchantGetResponseSchema,
  ContactsMerchantListResponseSchema,
  ContactsMerchantMutationResponseSchema,
} from './wire.js';

import type { MobileAddress } from '../../contract/rest-schemas.js';
import type { ContactsMerchant } from './wire.js';

/**
 * The contacts pillar id, as registered with the registry.
 *
 * Declared here rather than imported, for the reason every other leg's
 * pillar id is: `scripts/ci/check-cross-pillar-expectations.mjs` resolves a
 * `pillar()` call's target from the calling file alone.
 */
export const CONTACTS_PILLAR_ID = 'contacts';

/**
 * How many candidates {@link findMerchantByExactName} pulls back when a create
 * reports a conflict. `contacts`' name-uniqueness index is
 * `COLLATE UNICODE_NOCASE`, so a conflict means exactly one existing entity
 * can own that name — this only needs to be wide enough that a same-named
 * entity is somewhere in the page, and 50 matches the candidate width
 * `purchases`' own merchant resolver already uses for the same kind of
 * "search, then find the exact one" step.
 */
const MERCHANT_NAME_CONFLICT_SEARCH_LIMIT = 50;

/** The subset of contacts' router bfm calls to resolve merchant names and addresses. */
export type ContactsEntitiesRouter = {
  entities: {
    lookup: (input: { ids?: string[] }) => Promise<unknown>;
    list: (input: { search?: string; limit?: number }) => Promise<unknown>;
    get: (input: { id: string }) => Promise<unknown>;
    create: (input: { name: string }) => Promise<unknown>;
    addresses: {
      list: (input: { id: string }) => Promise<unknown>;
      create: (input: { id: string; value: string }) => Promise<unknown>;
    };
  };
};

export interface MobileContactsClient {
  /**
   * Resolve `ids` to their contacts names, in one call.
   *
   * Returns `Ok(empty map)` without calling contacts at all when `ids` is
   * empty — a page with no merchant ids at all must not cost a request. An
   * id contacts does not (or no longer) hold is silently absent from the
   * map; the caller treats "not in the map" as unresolved, not as an error.
   */
  lookupEntities(ids: readonly string[]): Promise<GatewayOutcome<ReadonlyMap<string, string>>>;

  /** Every address recorded against merchant `id` (ADR-053). A 404 (unknown merchant) is a `GatewayFailure`, never a crash. */
  getMerchantAddresses(id: string): Promise<GatewayOutcome<readonly MobileAddress[]>>;

  /** Record a new address for merchant `id` (ADR-053). */
  createMerchantAddress(id: string, value: string): Promise<GatewayOutcome<MobileAddress>>;

  /**
   * Merchants whose name or alias matches `query`, up to `limit` (POPS-3753).
   * `contacts`' own `entities.list` search already scans aliases as well as
   * names — see `pillars/contacts/src/entities/repo.rs`'s `list` — so this
   * leans on it directly rather than re-implementing the match.
   */
  searchMerchants(
    query: string,
    limit?: number
  ): Promise<GatewayOutcome<readonly ContactsMerchant[]>>;

  /** One merchant by id. A 404 (unknown merchant) is a `GatewayFailure`, never a crash. */
  getMerchant(id: string): Promise<GatewayOutcome<ContactsMerchant>>;

  /**
   * Record a new merchant named `name`.
   *
   * Idempotent by name: `contacts` enforces a case-insensitive unique index
   * on `entities.name`, so a repeated create for the same name — a double
   * tap on the sheet's Create button — answers a `conflict` from the
   * gateway rather than minting a second entity. This function resolves
   * that conflict to the entity that already owns the name and answers it
   * as an `ok`, so a caller sees the SAME id both times rather than having
   * to special-case a 409 on what it drew as a create action.
   */
  createMerchant(name: string): Promise<GatewayOutcome<ContactsMerchant>>;
}

export function createMobileContactsClient(gateway: PillarGateway): MobileContactsClient {
  return {
    lookupEntities: (ids) => lookupEntities(gateway, ids),
    getMerchantAddresses: (id) => getMerchantAddresses(gateway, id),
    createMerchantAddress: (id, value) => createMerchantAddress(gateway, id, value),
    searchMerchants: (query, limit) => searchMerchants(gateway, query, limit),
    getMerchant: (id) => getMerchant(gateway, id),
    createMerchant: (name) => createMerchant(gateway, name),
  };
}

async function lookupEntities(
  gateway: PillarGateway,
  ids: readonly string[]
): Promise<GatewayOutcome<ReadonlyMap<string, string>>> {
  if (ids.length === 0) return { kind: 'ok', value: new Map() };

  const outcome = await gateway.call<ContactsEntitiesRouter, unknown>(
    CONTACTS_PILLAR_ID,
    (handle) => handle.entities.lookup({ ids: [...ids] })
  );

  const parsed = parseOrMismatch(
    CONTACTS_PILLAR_ID,
    outcome,
    ContactsLookupResponseSchema,
    'entities.lookup'
  );
  if (!isGatewayOk(parsed)) return parsed;

  const names = new Map<string, string>();
  for (const entity of parsed.value.entities) {
    names.set(entity.id, entity.name);
  }
  return { kind: 'ok', value: names };
}

async function getMerchantAddresses(
  gateway: PillarGateway,
  id: string
): Promise<GatewayOutcome<readonly MobileAddress[]>> {
  const outcome = await gateway.call<ContactsEntitiesRouter, unknown>(
    CONTACTS_PILLAR_ID,
    (handle) => handle.entities.addresses.list({ id })
  );

  const parsed = parseOrMismatch(
    CONTACTS_PILLAR_ID,
    outcome,
    ContactsAddressListResponseSchema,
    'entities.addresses.list'
  );
  if (!isGatewayOk(parsed)) return parsed;

  return { kind: 'ok', value: parsed.value.data };
}

async function createMerchantAddress(
  gateway: PillarGateway,
  id: string,
  value: string
): Promise<GatewayOutcome<MobileAddress>> {
  const outcome = await gateway.call<ContactsEntitiesRouter, unknown>(
    CONTACTS_PILLAR_ID,
    (handle) => handle.entities.addresses.create({ id, value })
  );

  const parsed = parseOrMismatch(
    CONTACTS_PILLAR_ID,
    outcome,
    ContactsAddressMutationResponseSchema,
    'entities.addresses.create'
  );
  if (!isGatewayOk(parsed)) return parsed;

  return { kind: 'ok', value: parsed.value.data };
}

async function searchMerchants(
  gateway: PillarGateway,
  query: string,
  limit: number | undefined
): Promise<GatewayOutcome<readonly ContactsMerchant[]>> {
  const outcome = await gateway.call<ContactsEntitiesRouter, unknown>(
    CONTACTS_PILLAR_ID,
    (handle) => handle.entities.list({ search: query, limit })
  );

  const parsed = parseOrMismatch(
    CONTACTS_PILLAR_ID,
    outcome,
    ContactsMerchantListResponseSchema,
    'entities.list'
  );
  if (!isGatewayOk(parsed)) return parsed;

  return { kind: 'ok', value: parsed.value.data };
}

async function getMerchant(
  gateway: PillarGateway,
  id: string
): Promise<GatewayOutcome<ContactsMerchant>> {
  const outcome = await gateway.call<ContactsEntitiesRouter, unknown>(
    CONTACTS_PILLAR_ID,
    (handle) => handle.entities.get({ id })
  );

  const parsed = parseOrMismatch(
    CONTACTS_PILLAR_ID,
    outcome,
    ContactsMerchantGetResponseSchema,
    'entities.get'
  );
  if (!isGatewayOk(parsed)) return parsed;

  return { kind: 'ok', value: parsed.value.data };
}

async function createMerchant(
  gateway: PillarGateway,
  name: string
): Promise<GatewayOutcome<ContactsMerchant>> {
  const outcome = await gateway.call<ContactsEntitiesRouter, unknown>(
    CONTACTS_PILLAR_ID,
    (handle) => handle.entities.create({ name })
  );

  if (!isGatewayOk(outcome) && outcome.kind === 'conflict') {
    return findMerchantByExactName(gateway, name);
  }

  const parsed = parseOrMismatch(
    CONTACTS_PILLAR_ID,
    outcome,
    ContactsMerchantMutationResponseSchema,
    'entities.create'
  );
  if (!isGatewayOk(parsed)) return parsed;

  return { kind: 'ok', value: parsed.value.data };
}

/**
 * Resolve a create-time name conflict to the entity that already owns it —
 * see {@link MobileContactsClient.createMerchant}'s docstring for why this
 * exists. Falls back to surfacing the conflict unchanged on the (should not
 * happen) case where a fresh search does not turn the name back up, rather
 * than claiming an id this function never actually found.
 */
async function findMerchantByExactName(
  gateway: PillarGateway,
  name: string
): Promise<GatewayOutcome<ContactsMerchant>> {
  const trimmed = name.trim();
  const outcome = await gateway.call<ContactsEntitiesRouter, unknown>(
    CONTACTS_PILLAR_ID,
    (handle) =>
      handle.entities.list({ search: trimmed, limit: MERCHANT_NAME_CONFLICT_SEARCH_LIMIT })
  );

  const parsed = parseOrMismatch(
    CONTACTS_PILLAR_ID,
    outcome,
    ContactsMerchantListResponseSchema,
    'entities.list'
  );
  if (!isGatewayOk(parsed)) return parsed;

  const existing = parsed.value.data.find(
    (entity) => entity.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (existing === undefined) {
    return {
      kind: 'conflict',
      pillar: CONTACTS_PILLAR_ID,
      status: 409,
      detail: `create reported a conflict but no entity named '${trimmed}' was found on retry`,
    };
  }
  return { kind: 'ok', value: existing };
}
