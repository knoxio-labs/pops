import { logoUrlFor } from '../../logo-url.js';

import type { AccountOption } from '@pops/ui';

import type {
  AccountsListResponses,
  InstitutionsListResponses,
} from '../../finance-api/types.gen.js';

export type ApiAccount = AccountsListResponses[200]['data'][number];
export type ApiInstitution = InstitutionsListResponses[200]['data'][number];

/**
 * Joins the accounts list onto the institutions list so `AccountChip` and
 * `AccountSelect` — which know nothing about `institutionId` or how it is
 * fetched — get the institution's name, colour and logo already resolved.
 */
export function toAccountOptions(
  accounts: ApiAccount[],
  institutions: ApiInstitution[]
): AccountOption[] {
  const institutionsById = new Map(
    institutions.map((institution) => [institution.id, institution])
  );
  return accounts.map((account) => {
    const institution = account.institutionId
      ? institutionsById.get(account.institutionId)
      : undefined;
    return {
      id: account.id,
      name: account.name,
      kind: account.kind,
      archived: account.archivedAt !== null,
      institution: institution
        ? {
            id: institution.id,
            name: institution.name,
            colour: institution.colour,
            logoUrl: institution.logoAssetId ? logoUrlFor(institution.logoAssetId) : undefined,
          }
        : undefined,
    };
  });
}
