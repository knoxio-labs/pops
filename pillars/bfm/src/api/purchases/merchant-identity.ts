/**
 * The three-way merchant identity a mobile response carries (POPS-3634).
 *
 * `purchases`' own `GET /purchases` is not changed to resolve a display
 * name — ADR-042's `entity_id` invariant argues against a second stored copy
 * of the entity's name, and the read path gains no new outbound dependency
 * for it. bfm resolves the name itself instead, via its own batched contacts
 * lookup (`../contacts/client.ts`): the caller's `mergedNames` map is that
 * lookup's result, built once per request from every distinct
 * `merchantEntityId` the response carries, never looked up per row.
 *
 * `entityId` is operative and decides the resolution on its own —
 * `merchantEntityName` is only ever the till's printed wording, kept
 * verbatim even when an entity resolved (`purchases/api/contacts/
 * merchant.ts`'s own docstring says so), so it is never read as evidence of
 * resolution, only as the fallback label when the entity has none in
 * `mergedNames` and as the deprecated `merchantName` field alongside it.
 */
import type { MobileMerchantIdentity } from '../../contract/rest-schemas.js';

export function toMerchantIdentity(
  entityId: string | null,
  rawName: string | null,
  mergedNames: ReadonlyMap<string, string>
): MobileMerchantIdentity {
  if (entityId !== null) {
    return { resolution: 'entity', entityId, name: mergedNames.get(entityId) ?? null };
  }
  const name = rawName !== null && rawName.trim().length > 0 ? rawName : null;
  if (name !== null) return { resolution: 'name', name };
  return { resolution: 'unattributed' };
}
