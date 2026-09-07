/**
 * Stand-ins for the finance account reads the import wizard makes before it
 * shows a file input (POPS-2840): the account picker's list, whose issuing
 * institution now arrives embedded on each account row (POPS-3063) rather
 * than through a separate institutions fetch/join.
 *
 * Hand-mirrored from `rest-accounts.ts`'s `AccountSchema`, for the reason
 * every per-spec schema here is mirrored rather than imported:
 * `shell-no-cross-internal` (`.dependency-cruiser.cjs`) stops the shell
 * reaching a pillar's contract package.
 */
import { z } from 'zod';

import { fulfilWith } from './pillar-rest';

import type { Page } from '@playwright/test';

/** The not-yet-migrated institution fallback shape — see `AccountSchema.institution`. */
export const AccountIssuerInstitutionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    colour: z.string(),
    logoAssetId: z.string().nullable(),
  })
  .strict();

export const AccountSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    institutionId: z.string().nullable(),
    kind: z.string(),
    currency: z.string(),
    archivedAt: z.string().nullable(),
    displayOrder: z.number().int(),
    entityId: z.string().nullable(),
    entityDisplayName: z.string().nullable(),
    entityDisplayNameStale: z.boolean(),
    entityColour: z.string().nullable(),
    entityAvatarAssetId: z.string().nullable(),
    resolvedEntityId: z.string().nullable(),
    institution: AccountIssuerInstitutionSchema.nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

export const AccountsListResponseSchema = z
  .object({
    data: z.array(AccountSchema),
    pagination: z
      .object({ total: z.number(), limit: z.number(), offset: z.number(), hasMore: z.boolean() })
      .strict(),
  })
  .strict();

export type StubAccount = z.infer<typeof AccountSchema>;

/**
 * Serve one account. The embedded `institution.name` is what the Upload step
 * keys the account's bank dialects off (`BANK_TYPE_BY_INSTITUTION_NAME` in
 * `account-step/import-formats.ts`); an unrecognised name — or no
 * `institution` at all — leaves the account with no format and no dropzone.
 */
export async function stubFinanceAccount(page: Page, account: StubAccount): Promise<void> {
  await page.route(
    '**/finance-api/accounts?**',
    fulfilWith(
      200,
      AccountsListResponseSchema,
      {
        data: [account],
        pagination: { total: 1, limit: 500, offset: 0, hasMore: false },
      },
      'accounts.list'
    )
  );
}
