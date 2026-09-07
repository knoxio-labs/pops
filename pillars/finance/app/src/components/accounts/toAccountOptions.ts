import { hasIssuingInstitution } from '@pops/finance';

import { avatarUrlFor } from '../../entity-avatar-url.js';

import type { AccountInstitution, AccountOption } from '@pops/ui';

import type { AccountsListResponses } from '../../finance-api/types.gen.js';

export type ApiAccount = AccountsListResponses[200]['data'][number];

/**
 * Fallback swatch for the (never-expected-in-practice) case where an
 * account resolved a contacts Entity's display name but not its colour —
 * contacts always assigns one at creation, so this only matters if a
 * fixture or a future contacts change ever leaves it unset.
 */
const FALLBACK_INSTITUTION_COLOUR = '#6b7280';

/**
 * The issuer chip an issuer-bearing account renders, read straight off the
 * server-resolved fields (POPS-3063) — no client-side join against a
 * separately-fetched entity list. `entityDisplayName` set means a contacts
 * Entity resolved via the account's own `entityId`; `resolvedEntityId` names
 * which Entity, for the avatar URL. `undefined` for `cash`/`person` (no
 * issuing institution at all) and for an issuer-bearing account genuinely
 * unlinked to one.
 */
function resolveInstitution(account: ApiAccount): AccountInstitution | undefined {
  if (!hasIssuingInstitution(account.kind)) return undefined;
  // Loose `!= null` throughout: a fixture built against an older/incomplete
  // shape (or a hand-rolled test double) can omit these fields entirely
  // rather than setting them to `null`, and `undefined` must degrade the
  // same way `null` does rather than being read as "resolved".
  if (account.entityDisplayName != null) {
    return {
      id: account.resolvedEntityId ?? account.id,
      name: account.entityDisplayName,
      colour: account.entityColour ?? FALLBACK_INSTITUTION_COLOUR,
      logoUrl:
        account.entityAvatarAssetId != null && account.resolvedEntityId != null
          ? avatarUrlFor(account.resolvedEntityId)
          : undefined,
    };
  }
  return undefined;
}

/** Maps the accounts list response straight to `AccountChip`/`AccountSelect`'s option shape. */
export function toAccountOptions(accounts: ApiAccount[]): AccountOption[] {
  return accounts.map((account) => ({
    id: account.id,
    name: account.name,
    kind: account.kind,
    archived: account.archivedAt !== null,
    institution: resolveInstitution(account),
  }));
}
