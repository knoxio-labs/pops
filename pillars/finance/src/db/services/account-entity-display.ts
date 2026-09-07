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
 * Every row resolves against ONE target `entityId`, picked in this order:
 *
 *   1. `row.entityId` when set — a `person` account's contact, or an
 *      issuer-bearing account already backfilled/created against a
 *      `bank`-typed Entity directly (POPS-3063).
 *   2. Otherwise, for an issuer-bearing row with `row.institutionId` set,
 *      that institution's `migratedEntityId` if it has one — the read-only
 *      transition-window fallback for an account whose institution has been
 *      migrated (POPS-3062) but not yet backfilled onto its own `entityId`.
 *      This NEVER writes `entityId` back; that is `migrations/0099`'s job.
 *   3. Otherwise null — nothing to resolve via contacts. A `person` account
 *      still pending outbox resolution reports its own stored name and
 *      `stale: false` (not staleness, simply not linked yet); an
 *      issuer-bearing account whose institution has NOT migrated
 *      (POPS-3099) reports that institution's own name/colour/logo instead,
 *      exactly what it showed before this ticket, so the caller never needs
 *      a separate institutions fetch to keep displaying it.
 */
import { hasIssuingInstitution } from '../../contract/account-kind.js';

import type { ContactsClient } from '../../api/contacts/client.js';
import type { AccountRow } from './accounts.js';
import type { InstitutionRow } from './institutions.js';

/** The institution fields a not-yet-migrated issuer-bearing account falls back to. */
export interface AccountIssuerInstitution {
  id: string;
  name: string;
  colour: string;
  logoAssetId: string | null;
}

/** Resolved display metadata for one account, keyed onto the wire response. */
export interface AccountEntityDisplay {
  entityDisplayName: string | null;
  entityDisplayNameStale: boolean;
  /** Contacts-sourced colour, only set when `entityDisplayName` resolved via a contacts Entity. */
  entityColour: string | null;
  /** Contacts-sourced avatar asset id, same condition as {@link entityColour}. */
  entityAvatarAssetId: string | null;
  /**
   * The contacts Entity id `entityDisplayName`/`entityColour`/
   * `entityAvatarAssetId` were actually resolved from — `row.entityId`
   * itself when that was the target, or the migrated institution's id when
   * it was resolved through the fallback instead. A caller needs this
   * (rather than `Account.entityId`, which can be null in the fallback
   * case) to build the contacts avatar URL. Null whenever the other three
   * are null.
   */
  resolvedEntityId: string | null;
  /**
   * The issuing institution's OWN name/colour/logo, set only as the
   * not-yet-migrated fallback (no `entityId` resolved for this row at all).
   * Mutually exclusive with a non-null `entityDisplayName`.
   */
  institution: AccountIssuerInstitution | null;
}

const NO_ISSUER: AccountEntityDisplay = {
  entityDisplayName: null,
  entityDisplayNameStale: false,
  entityColour: null,
  entityAvatarAssetId: null,
  resolvedEntityId: null,
  institution: null,
};

/** The institution fields this resolver reads, keyed by `institutions.id`. */
export type InstitutionsById = ReadonlyMap<
  string,
  Pick<InstitutionRow, 'id' | 'name' | 'colour' | 'logoAssetId' | 'migratedEntityId'>
>;

function institutionFallback(institution: AccountIssuerInstitution): AccountEntityDisplay {
  return {
    entityDisplayName: null,
    entityDisplayNameStale: false,
    entityColour: null,
    entityAvatarAssetId: null,
    resolvedEntityId: null,
    institution,
  };
}

function ownNameDisplay(row: AccountRow, stale: boolean): AccountEntityDisplay {
  return {
    entityDisplayName: row.name,
    entityDisplayNameStale: stale,
    entityColour: null,
    entityAvatarAssetId: null,
    resolvedEntityId: null,
    institution: null,
  };
}

/** The target `entityId` a row's issuer/contact display should resolve against, per the order above. */
function targetEntityId(row: AccountRow, institutionsById: InstitutionsById): string | null {
  if (row.entityId !== null) return row.entityId;
  if (row.institutionId === null) return null;
  return institutionsById.get(row.institutionId)?.migratedEntityId ?? null;
}

/** What a row with no resolvable `entityId` at all displays instead. */
function unlinkedDisplay(
  row: AccountRow,
  institutionsById: InstitutionsById
): AccountEntityDisplay {
  if (row.kind === 'person') return ownNameDisplay(row, false);
  if (!hasIssuingInstitution(row.kind) || row.institutionId === null) return NO_ISSUER;
  const institution = institutionsById.get(row.institutionId);
  return institution ? institutionFallback(institution) : NO_ISSUER;
}

/**
 * Resolve `{ entityDisplayName, entityDisplayNameStale, entityColour,
 * entityAvatarAssetId, resolvedEntityId, institution }` for every row in
 * `rows`, keyed by account id. Only rows with a resolvable target `entityId`
 * (see the module docstring) make a contacts call — one per distinct target
 * id, deduped via `cache`, since more than one account can point at the same
 * contact.
 */
export async function resolveAccountEntityDisplays(
  contacts: ContactsClient,
  rows: readonly AccountRow[],
  institutionsById: InstitutionsById
): Promise<Map<string, AccountEntityDisplay>> {
  const result = new Map<string, AccountEntityDisplay>();
  const cache = new Map<string, Awaited<ReturnType<ContactsClient['fetchEntitySummary']>>>();

  for (const row of rows) {
    const entityId = targetEntityId(row, institutionsById);
    if (entityId === null) {
      result.set(row.id, unlinkedDisplay(row, institutionsById));
      continue;
    }
    if (!cache.has(entityId)) {
      cache.set(entityId, await contacts.fetchEntitySummary(entityId));
    }
    const resolved = cache.get(entityId) ?? null;
    result.set(
      row.id,
      resolved === null
        ? ownNameDisplay(row, true)
        : {
            entityDisplayName: resolved.name,
            entityDisplayNameStale: false,
            entityColour: resolved.colour,
            entityAvatarAssetId: resolved.avatarAssetId,
            resolvedEntityId: entityId,
            institution: null,
          }
    );
  }
  return result;
}
