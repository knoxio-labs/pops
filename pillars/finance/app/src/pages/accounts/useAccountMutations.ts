import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ALL_ACCOUNTS_KEY } from '../../components/accounts/hooks/useAllAccounts';
import { unwrap } from '../../finance-api-helpers.js';
import {
  accountsCreate,
  accountsUpdate,
  giftCardDetailsWrite,
  loanWriteTerms,
} from '../../finance-api/index.js';
import { hasCompleteLoanTermsInput, hasInstitution, type AccountFormValues } from './types';

import type { Account } from './types';

export const ACCOUNTS_KEY = ['finance', 'accounts', 'page'] as const;
export const loanTermsKey = (accountId: string) =>
  ['finance', 'accounts', accountId, 'loan-terms'] as const;

async function writeGiftCardDetails(accountId: string, values: AccountFormValues) {
  if (values.giftCardNumber === '' || values.giftCardPin === '') return;
  await unwrap(
    await giftCardDetailsWrite({
      path: { id: accountId },
      body: {
        number: values.giftCardNumber,
        pin: values.giftCardPin,
        expiresOn: values.giftCardExpiresOn || null,
      },
    })
  );
}

/**
 * `writeLoanTerms` follow-up write, mirroring `writeGiftCardDetails` — only
 * fires once every loan-terms field is filled (`loanTermsPartiallyFilled`
 * blocks submit before this point otherwise), and stays a no-op for an
 * account left with no terms at all, which is a valid loan account per the
 * insight modules' "no loan terms recorded" empty states.
 */
async function writeLoanTerms(accountId: string, values: AccountFormValues) {
  if (!hasCompleteLoanTermsInput(values)) return;
  await unwrap(
    await loanWriteTerms({
      path: { id: accountId },
      body: {
        originalPrincipal: values.loanOriginalPrincipal ?? 0,
        annualRatePct: values.loanAnnualRatePct ?? 0,
        termMonths: values.loanTermMonths ?? 0,
        monthlyRepayment: values.loanMonthlyRepayment ?? 0,
        startedOn: values.loanStartedOn,
        termsEffectiveFrom: values.loanTermsEffectiveFrom,
      },
    })
  );
}

function toAccountPayload(values: AccountFormValues) {
  return {
    name: values.name,
    kind: values.kind,
    institutionId: hasInstitution(values.kind) ? values.institutionId : null,
    currency: values.currency,
  };
}

/**
 * Create/update mutations for the accounts form, including the follow-up
 * writes that hang off `values.kind` — `gift-card-details` and `loan-terms`.
 */
export function useAccountMutations(onSuccess: () => void) {
  const queryClient = useQueryClient();
  const invalidate = (accountId?: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
      queryClient.invalidateQueries({ queryKey: ALL_ACCOUNTS_KEY }),
      ...(accountId ? [queryClient.invalidateQueries({ queryKey: loanTermsKey(accountId) })] : []),
    ]);

  const createMutation = useMutation({
    mutationFn: async (values: AccountFormValues) => {
      const created = unwrap(await accountsCreate({ body: toAccountPayload(values) }));
      if (values.kind === 'gift-card') await writeGiftCardDetails(created.data.id, values);
      if (values.kind === 'loan') await writeLoanTerms(created.data.id, values);
      return created;
    },
    onSuccess: () => {
      toast.success('Account created');
      onSuccess();
    },
    onSettled: (data) => invalidate(data?.data.id),
  });
  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      values,
      loanTermsDirty = true,
    }: {
      id: string;
      values: AccountFormValues;
      /**
       * Whether the caller's form actually touched a loan-terms field this
       * session — see `loanTermsFieldsDirty`. Defaults to `true` so a caller
       * that doesn't track dirtiness gets today's always-write behaviour;
       * `useAccountsPage` passes the real value to avoid resubmitting a
       * stale `loanTermsEffectiveFrom` snapshot on an unrelated-field edit.
       */
      loanTermsDirty?: boolean;
    }) => {
      const updated = unwrap(
        await accountsUpdate({ path: { id }, body: toAccountPayload(values) })
      );
      if (values.kind === 'gift-card') await writeGiftCardDetails(id, values);
      if (values.kind === 'loan' && loanTermsDirty) await writeLoanTerms(id, values);
      return updated;
    },
    onSuccess: () => {
      toast.success('Account updated');
      onSuccess();
    },
    onSettled: (_data, _error, variables) => invalidate(variables?.id),
  });
  const archiveMutation = useMutation({
    mutationFn: async ({ id, archivedAt }: { id: string; archivedAt: string | null }) =>
      unwrap(await accountsUpdate({ path: { id }, body: { archivedAt } })),
    onSuccess: (_, variables) => {
      toast.success(variables.archivedAt !== null ? 'Account archived' : 'Account unarchived');
      onSuccess();
    },
    onSettled: () => invalidate(),
  });
  return { createMutation, updateMutation, archiveMutation };
}

/** Toggle an account's `archivedAt`, stamping the current time to archive or clearing it to unarchive. */
export function toggleArchived(account: Pick<Account, 'archivedAt'>): string | null {
  return account.archivedAt !== null ? null : new Date().toISOString();
}
