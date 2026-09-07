/**
 * Read-side issuer/contact display resolution for accounts (POPS-2771,
 * extended POPS-3063), split out of `accounts.ts` since it needs the live
 * `ContactsClient` seam the rest of that file has no reason to depend on
 * (mirrors `entity-usage.ts`'s live-fetch-at-request-time pattern rather than
 * a local mirror table).
 *
 * `accounts.name` stays finance's own label — the value an account was
 * created or last patched with — and is never overwritten from a resolved
 * contact name. The resolved name is additional read-side metadata:
 * `entityDisplayName` is the linked contact's current name from contacts,
 * degrading to `accounts.name` (with `entityDisplayNameStale: true`) when
 * contacts can't be reached to refresh it.
 *
 * Every row resolves against `row.entityId` — a `person` account's contact,
 * or an issuer-bearing account's `bank`-typed Entity (POPS-3063). A `person`
 * account still pending outbox resolution reports its own stored name and
 * `stale: false` (not staleness, simply not linked yet); any other row with
 * no `entityId` has nothing to resolve via contacts.
 */
import type { ContactsClient } from '../../api/contacts/client.js';
import type { AccountRow } from './accounts.js';

/** Resolved display metadata for one account, keyed onto the wire response. */
export interface AccountEntityDisplay {
  entityDisplayName: string | null;
  entityDisplayNameStale: boolean;
  /** Contacts-sourced colour, only set when `entityDisplayName` resolved via a contacts Entity. */
  entityColour: string | null;
  /** Contacts-sourced avatar asset id, same condition as {@link entityColour}. */
  entityAvatarAssetId: string | null;
  /** The contacts Entity id `entityDisplayName`/`entityColour`/
   * `entityAvatarAssetId` were actually resolved from — `row.entityId`
   * itself. Null whenever the other three are null. */
  resolvedEntityId: string | null;
}

const NO_ISSUER: AccountEntityDisplay = {
  entityDisplayName: null,
  entityDisplayNameStale: false,
  entityColour: null,
  entityAvatarAssetId: null,
  resolvedEntityId: null,
};

function ownNameDisplay(row: AccountRow, stale: boolean): AccountEntityDisplay {
  return {
    entityDisplayName: row.name,
    entityDisplayNameStale: stale,
    entityColour: null,
    entityAvatarAssetId: null,
    resolvedEntityId: null,
  };
}

/** What a row with no `entityId` at all displays instead. */
function unlinkedDisplay(row: AccountRow): AccountEntityDisplay {
  if (row.kind === 'person') return ownNameDisplay(row, false);
  return NO_ISSUER;
}

/**
 * Resolve `{ entityDisplayName, entityDisplayNameStale, entityColour,
 * entityAvatarAssetId, resolvedEntityId }` for every row in `rows`, keyed by
 * account id. Only rows with a non-null `entityId` make a contacts call — one
 * per distinct id, deduped via `cache`, since more than one account can point
 * at the same contact.
 */
export async function resolveAccountEntityDisplays(
  contacts: ContactsClient,
  rows: readonly AccountRow[]
): Promise<Map<string, AccountEntityDisplay>> {
  const result = new Map<string, AccountEntityDisplay>();
  const cache = new Map<string, Awaited<ReturnType<ContactsClient['fetchEntitySummary']>>>();

  for (const row of rows) {
    if (row.entityId === null) {
      result.set(row.id, unlinkedDisplay(row));
      continue;
    }
    if (!cache.has(row.entityId)) {
      cache.set(row.entityId, await contacts.fetchEntitySummary(row.entityId));
    }
    const resolved = cache.get(row.entityId) ?? null;
    result.set(
      row.id,
      resolved === null
        ? ownNameDisplay(row, true)
        : {
            entityDisplayName: resolved.name,
            entityDisplayNameStale: false,
            entityColour: resolved.colour,
            entityAvatarAssetId: resolved.avatarAssetId,
            resolvedEntityId: row.entityId,
          }
    );
  }
  return result;
}
