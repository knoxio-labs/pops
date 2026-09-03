/**
 * Read-side contact display-name resolution for `person` accounts
 * (POPS-2771), split out of `accounts.ts` since it needs the live
 * `ContactsClient` seam the rest of that file has no reason to depend on
 * (mirrors `entity-usage.ts`'s live-fetch-at-request-time pattern rather than
 * a local mirror table).
 *
 * `accounts.name` stays finance's own label — the value a `person` account
 * was created or last patched with — and is never overwritten from a
 * resolved contact name. The resolved name is additional read-side metadata:
 * `entityDisplayName` is the contact's current name from contacts, degrading
 * to `accounts.name` (with `entityDisplayNameStale: true`) when contacts
 * can't be reached to refresh it. A `person` account still pending outbox
 * resolution (`entityId === null`) has no contact to look up yet, so it
 * reports its own stored name and `stale: false` — that's not staleness, it's
 * simply not linked yet.
 */
import type { ContactsClient } from '../../api/contacts/client.js';
import type { AccountRow } from './accounts.js';

/** Resolved display metadata for one account, keyed onto the wire response. */
export interface AccountEntityDisplay {
  entityDisplayName: string | null;
  entityDisplayNameStale: boolean;
}

const NOT_A_PERSON: AccountEntityDisplay = {
  entityDisplayName: null,
  entityDisplayNameStale: false,
};

/**
 * Resolve `{ entityDisplayName, entityDisplayNameStale }` for every row in
 * `rows`, keyed by account id. Only `person` accounts with a real
 * (non-pending) `entityId` make a contacts call — one per distinct
 * `entityId`, deduped via `cache`, since more than one currency's account can
 * point at the same contact.
 */
export async function resolveAccountEntityDisplays(
  contacts: ContactsClient,
  rows: readonly AccountRow[]
): Promise<Map<string, AccountEntityDisplay>> {
  const result = new Map<string, AccountEntityDisplay>();
  const cache = new Map<string, string | null>();

  for (const row of rows) {
    if (row.kind !== 'person') {
      result.set(row.id, NOT_A_PERSON);
      continue;
    }
    if (row.entityId === null) {
      result.set(row.id, { entityDisplayName: row.name, entityDisplayNameStale: false });
      continue;
    }
    if (!cache.has(row.entityId)) {
      cache.set(row.entityId, await contacts.fetchEntityDisplayName(row.entityId));
    }
    const resolved = cache.get(row.entityId) ?? null;
    result.set(
      row.id,
      resolved === null
        ? { entityDisplayName: row.name, entityDisplayNameStale: true }
        : { entityDisplayName: resolved, entityDisplayNameStale: false }
    );
  }
  return result;
}
