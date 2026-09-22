/**
 * bfm's contacts leg, scoped to exactly what merchant-identity resolution
 * needs (POPS-3634): naming the entities a page of purchases already
 * carries an id for.
 *
 * The purchases pillar never resolves a merchant's DISPLAY name at read
 * time — `merchantEntityId` is the operative fact, `merchantEntityName` is
 * only the till's own wording, and `GET /purchases` gains no new outbound
 * dependency to bridge the two (POPS-3634's recorded decision,
 * `purchases/list-wire.ts`'s docstring). bfm already reads across pillars
 * for every other mobile surface, so it resolves the name itself, batched:
 * one `entities.lookup` call answers every distinct entity id a page of
 * purchases carries, never one call per row.
 *
 * `contacts`' `/entities/lookup` has no id filter yet (POPS-3925 tracks
 * adding one) — today it always answers its whole match set. This still
 * costs exactly one call per page: the full set is fetched once and
 * filtered to the ids this page actually carries. Once POPS-3925 lands,
 * `handle.entities.lookup({ ids })` narrows the request itself and this
 * file's filtering step becomes redundant rather than wrong.
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
} from './wire.js';

import type { MobileAddress } from '../../contract/rest-schemas.js';

/**
 * The contacts pillar id, as registered with the registry.
 *
 * Declared here rather than imported, for the reason every other leg's
 * pillar id is: `scripts/ci/check-cross-pillar-expectations.mjs` resolves a
 * `pillar()` call's target from the calling file alone.
 */
export const CONTACTS_PILLAR_ID = 'contacts';

/** The subset of contacts' router bfm calls to resolve merchant names and addresses. */
export type ContactsEntitiesRouter = {
  entities: {
    lookup: (input: { ids?: string[] }) => Promise<unknown>;
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
}

export function createMobileContactsClient(gateway: PillarGateway): MobileContactsClient {
  return {
    async lookupEntities(ids) {
      if (ids.length === 0) return { kind: 'ok', value: new Map() };

      const outcome = await gateway.call<ContactsEntitiesRouter, unknown>(
        CONTACTS_PILLAR_ID,
        (handle) => handle.entities.lookup({})
      );

      const parsed = parseOrMismatch(
        CONTACTS_PILLAR_ID,
        outcome,
        ContactsLookupResponseSchema,
        'entities.lookup'
      );
      if (!isGatewayOk(parsed)) return parsed;

      const wanted = new Set(ids);
      const names = new Map<string, string>();
      for (const entity of parsed.value.entities) {
        if (wanted.has(entity.id)) names.set(entity.id, entity.name);
      }
      return { kind: 'ok', value: names };
    },

    async getMerchantAddresses(id) {
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
    },

    async createMerchantAddress(id, value) {
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
    },
  };
}
