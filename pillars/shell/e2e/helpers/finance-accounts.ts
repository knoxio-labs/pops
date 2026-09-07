/**
 * Stand-ins for the finance account reads the import wizard makes before it
 * shows a file input (POPS-2840): the account picker's list, whose issuing
 * institution is one contacts Entity resolved through `entityId` — the same
 * mechanism a person account's counterparty uses — rather than a separate
 * institutions fetch/join or table.
 *
 * Hand-mirrored from `rest-accounts.ts`'s `AccountSchema`, for the reason
 * every per-spec schema here is mirrored rather than imported:
 * `shell-no-cross-internal` (`.dependency-cruiser.cjs`) stops the shell
 * reaching a pillar's contract package.
 */
import { z } from 'zod';

import { fulfilWith } from './pillar-rest';

import type { Page } from '@playwright/test';

export const AccountSchema = z
  .object({
    id: z.string(),
    name: z.string(),
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
 * Serve one account. `entityDisplayName` is what the Upload step keys the
 * account's bank dialects off (`BANK_TYPE_BY_INSTITUTION_NAME` in
 * `account-step/import-formats.ts`, read via the client-derived
 * `AccountOption.institution.name`); an unrecognised name — or `null` —
 * leaves the account with no format and no dropzone.
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
