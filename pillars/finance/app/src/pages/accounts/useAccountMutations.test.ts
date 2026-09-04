import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_ACCOUNT_FORM_VALUES } from './types';
import { useAccountMutations } from './useAccountMutations';

const accountsCreate = vi.fn();
const accountsUpdate = vi.fn();
const loanWriteTerms = vi.fn();

vi.mock('../../finance-api/index.js', () => ({
  accountsCreate: (...args: unknown[]) => accountsCreate(...args),
  accountsUpdate: (...args: unknown[]) => accountsUpdate(...args),
  giftCardDetailsWrite: vi.fn(),
  loanWriteTerms: (...args: unknown[]) => loanWriteTerms(...args),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(client, 'invalidateQueries');
  wrapper.client = client;
  return createElement(QueryClientProvider, { client }, children);
}
wrapper.client = undefined as unknown as QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  accountsCreate.mockResolvedValue({
    data: { data: { id: 'acc-new', name: 'New Account' }, message: 'Created' },
    error: undefined,
  });
  accountsUpdate.mockResolvedValue({
    data: { data: { id: 'acc-1', name: 'Renamed', archivedAt: null }, message: 'Updated' },
    error: undefined,
  });
  loanWriteTerms.mockResolvedValue({
    data: { data: { accountId: 'acc-new' }, message: 'Terms saved' },
    error: undefined,
  });
});

const COMPLETE_LOAN_VALUES = {
  ...DEFAULT_ACCOUNT_FORM_VALUES,
  kind: 'loan' as const,
  loanOriginalPrincipal: 500_000,
  loanAnnualRatePct: 6.24,
  loanTermMonths: 360,
  loanMonthlyRepayment: 3_100,
  loanStartedOn: '2024-01-01',
  loanTermsEffectiveFrom: '2026-07-01',
};

describe('useAccountMutations loan terms follow-up', () => {
  it('writes loan terms and invalidates the per-account loan-terms cache on create', async () => {
    const { result } = renderHook(() => useAccountMutations(vi.fn()), { wrapper });

    await result.current.createMutation.mutateAsync(COMPLETE_LOAN_VALUES);

    expect(loanWriteTerms).toHaveBeenCalledWith({
      path: { id: 'acc-new' },
      body: {
        originalPrincipal: 500_000,
        annualRatePct: 6.24,
        termMonths: 360,
        monthlyRepayment: 3_100,
        startedOn: '2024-01-01',
        termsEffectiveFrom: '2026-07-01',
      },
    });
    await waitFor(() =>
      expect(wrapper.client.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['finance', 'accounts', 'acc-new', 'loan-terms'],
      })
    );
  });

  it('does not write loan terms for a loan account with none entered', async () => {
    const { result } = renderHook(() => useAccountMutations(vi.fn()), { wrapper });

    await result.current.createMutation.mutateAsync({
      ...DEFAULT_ACCOUNT_FORM_VALUES,
      kind: 'loan',
    });

    expect(loanWriteTerms).not.toHaveBeenCalled();
  });

  it('never writes loan terms for a non-loan account, even with stray loan field values', async () => {
    const { result } = renderHook(() => useAccountMutations(vi.fn()), { wrapper });

    await result.current.createMutation.mutateAsync({
      ...COMPLETE_LOAN_VALUES,
      kind: 'checking',
    });

    expect(loanWriteTerms).not.toHaveBeenCalled();
  });

  it('writes loan terms on update when the caller marks them dirty (the default)', async () => {
    const { result } = renderHook(() => useAccountMutations(vi.fn()), { wrapper });

    await result.current.updateMutation.mutateAsync({ id: 'acc-1', values: COMPLETE_LOAN_VALUES });

    expect(loanWriteTerms).toHaveBeenCalledWith({
      path: { id: 'acc-1' },
      body: expect.objectContaining({ termsEffectiveFrom: '2026-07-01' }),
    });
  });

  /**
   * Regression for the review-findings-gate HIGH finding on POPS-2846: once a
   * rate change has been recorded (via `recordLoanRate`, which never touches
   * `loan_terms.terms_effective_from`), the form's `loanTermsEffectiveFrom`
   * snapshot is earlier than the loan's actual latest rate. Resubmitting it
   * unconditionally on every save — even one that only renames the account —
   * gets rejected by the backend's `LoanRateNotLatestError`, after the rename
   * has already committed. `loanTermsDirty: false` (what `useAccountsPage`
   * passes when no loan field was touched this session) must skip the
   * `writeLoanTerms` call entirely rather than resend the stale snapshot.
   */
  it('does not write loan terms on update when the caller marks them clean, even though every field is filled', async () => {
    const { result } = renderHook(() => useAccountMutations(vi.fn()), { wrapper });

    await result.current.updateMutation.mutateAsync({
      id: 'acc-1',
      values: COMPLETE_LOAN_VALUES,
      loanTermsDirty: false,
    });

    expect(loanWriteTerms).not.toHaveBeenCalled();
  });
});

/**
 * `useAllAccounts` (the import wizard's and `EditableFormFields`' account
 * picker) reads a cache key this hook never wrote to before POPS-2840's
 * review-findings-gate flagged it — any account create/update/archive here
 * must bust it too, not just this page's own `ACCOUNTS_KEY`.
 */
describe('useAccountMutations cache invalidation', () => {
  it('invalidates both the accounts page cache and useAllAccounts cache on create', async () => {
    const { result } = renderHook(() => useAccountMutations(vi.fn()), { wrapper });

    await result.current.createMutation.mutateAsync(DEFAULT_ACCOUNT_FORM_VALUES);

    await waitFor(() =>
      expect(wrapper.client.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['finance', 'accounts', 'list'],
      })
    );
    expect(wrapper.client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['finance', 'accounts', 'page'],
    });
  });

  it('invalidates both caches on update', async () => {
    const { result } = renderHook(() => useAccountMutations(vi.fn()), { wrapper });

    await result.current.updateMutation.mutateAsync({
      id: 'acc-1',
      values: DEFAULT_ACCOUNT_FORM_VALUES,
    });

    await waitFor(() =>
      expect(wrapper.client.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['finance', 'accounts', 'list'],
      })
    );
  });

  it('invalidates both caches on archive', async () => {
    const { result } = renderHook(() => useAccountMutations(vi.fn()), { wrapper });

    await result.current.archiveMutation.mutateAsync({
      id: 'acc-1',
      archivedAt: '2026-01-01T00:00:00.000Z',
    });

    await waitFor(() =>
      expect(wrapper.client.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['finance', 'accounts', 'list'],
      })
    );
  });
});
