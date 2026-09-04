import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Transaction, TransactionFormValues } from './types';

const transactionsListMock = vi.hoisted(() => vi.fn());
const transactionsAvailableTagsMock = vi.hoisted(() => vi.fn());
const transactionsCreateMock = vi.hoisted(() => vi.fn());
const transactionsUpdateMock = vi.hoisted(() => vi.fn());
const transactionsDeleteMock = vi.hoisted(() => vi.fn());
const transactionsRestoreMock = vi.hoisted(() => vi.fn());
const transactionsUnlinkTransferMock = vi.hoisted(() => vi.fn());

const entitiesListMock = vi.hoisted(() => vi.fn());
const accountsListMock = vi.hoisted(() => vi.fn());
const institutionsListMock = vi.hoisted(() => vi.fn());

vi.mock('../../finance-api/index.js', () => ({
  transactionsList: (...args: unknown[]) => transactionsListMock(...args),
  transactionsAvailableTags: (...args: unknown[]) => transactionsAvailableTagsMock(...args),
  transactionsCreate: (...args: unknown[]) => transactionsCreateMock(...args),
  transactionsUpdate: (...args: unknown[]) => transactionsUpdateMock(...args),
  transactionsDelete: (...args: unknown[]) => transactionsDeleteMock(...args),
  transactionsRestore: (...args: unknown[]) => transactionsRestoreMock(...args),
  transactionsUnlinkTransfer: (...args: unknown[]) => transactionsUnlinkTransferMock(...args),
  accountsList: (...args: unknown[]) => accountsListMock(...args),
  institutionsList: (...args: unknown[]) => institutionsListMock(...args),
}));

// The entity picker now reads `entities.list` over the generated contacts REST
// client; the mock resolves the Hey API `{ data, error }` envelope so the
// hook's `unwrap` returns the list payload.
vi.mock('../../contacts-api/index.js', () => ({
  entitiesList: (...args: unknown[]) => entitiesListMock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { TransactionFormSchema } from './types';
import { buildSubmit, buildTransactionPayload, useTransactionsPage } from './useTransactionsPage';

function makeValues(overrides: Partial<TransactionFormValues> = {}): TransactionFormValues {
  return {
    date: '2026-04-26',
    amount: '-87.45',
    description: 'Woolworths Metro',
    accountId: 'acc-credit',
    type: 'purchase',
    entityId: '',
    tags: [],
    notes: '',
    ...overrides,
  };
}

/**
 * `type` widens to `string` so the suite can feed the empty type the API still
 * emits for older rows — the case the form prefill's `|| 'purchase'` exists for.
 */
type TransactionOverrides = Omit<Partial<Transaction>, 'type'> & { type?: string };

function makeTransaction({ type, ...overrides }: TransactionOverrides = {}): Transaction {
  return {
    id: 'txn-1',
    date: '2026-02-10',
    amount: -87.45,
    description: 'Woolworths Metro',
    account: 'Credit Card',
    accountId: 'acc-credit',
    type: (type ?? 'purchase') as Transaction['type'],
    entityId: 'ent-1',
    entityName: 'Woolworths',
    location: 'Sydney CBD',
    country: 'Australia',
    relatedTransactionId: null,
    notes: 'Weekly shop',
    tags: ['Groceries'],
    lastEditedTime: '2026-02-10T00:00:00.000Z',
    ...overrides,
  };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
  transactionsListMock.mockResolvedValue({
    data: { data: [], pagination: { total: 0, limit: 100, offset: 0, hasMore: false } },
    error: undefined,
  });
  transactionsAvailableTagsMock.mockResolvedValue({ data: { tags: [] }, error: undefined });
  transactionsCreateMock.mockResolvedValue({ data: { data: makeTransaction() }, error: undefined });
  transactionsUpdateMock.mockResolvedValue({ data: { data: makeTransaction() }, error: undefined });
  transactionsDeleteMock.mockResolvedValue({
    data: { message: 'deleted', snapshot: { id: 'txn-1' } },
    error: undefined,
  });
  transactionsRestoreMock.mockResolvedValue({
    data: { data: makeTransaction() },
    error: undefined,
  });
  transactionsUnlinkTransferMock.mockResolvedValue({
    data: { data: makeTransaction(), message: 'unlinked' },
    error: undefined,
  });
  entitiesListMock.mockResolvedValue({
    data: {
      data: [
        { id: 'ent-1', name: 'Woolworths', type: 'company' },
        { id: 'ent-2', name: 'Coles', type: 'company' },
      ],
      pagination: { total: 2, limit: 500, offset: 0, hasMore: false },
    },
    error: undefined,
  });
  accountsListMock.mockResolvedValue({
    data: {
      data: [
        {
          id: 'acc-credit',
          name: 'Credit Card',
          institutionId: null,
          kind: 'credit-card',
          currency: 'AUD',
          archivedAt: null,
          displayOrder: 0,
          entityId: null,
          entityDisplayName: null,
          entityDisplayNameStale: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'acc-debit',
          name: 'Debit Card',
          institutionId: null,
          kind: 'checking',
          currency: 'AUD',
          archivedAt: null,
          displayOrder: 1,
          entityId: null,
          entityDisplayName: null,
          entityDisplayNameStale: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      pagination: { total: 2, limit: 500, offset: 0, hasMore: false },
    },
    error: undefined,
  });
  institutionsListMock.mockResolvedValue({ data: { data: [] }, error: undefined });
});

describe('TransactionFormSchema — amount', () => {
  const baseValues = {
    date: '2026-04-26',
    description: 'Woolworths',
    accountId: 'acc-credit',
    type: 'purchase',
    entityId: '',
    tags: [],
    notes: '',
  };

  it('accepts a non-zero amount', () => {
    const result = TransactionFormSchema.safeParse({ ...baseValues, amount: '-12.50' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty amount with "Amount is required"', () => {
    const result = TransactionFormSchema.safeParse({ ...baseValues, amount: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find((i) => i.path[0] === 'amount')?.message;
      expect(msg).toBe('Amount is required');
    }
  });

  it('rejects "0" with "Amount must be non-zero"', () => {
    const result = TransactionFormSchema.safeParse({ ...baseValues, amount: '0' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find((i) => i.path[0] === 'amount')?.message;
      expect(msg).toBe('Amount must be non-zero');
    }
  });

  it('rejects "0.00" with "Amount must be non-zero"', () => {
    const result = TransactionFormSchema.safeParse({ ...baseValues, amount: '0.00' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find((i) => i.path[0] === 'amount')?.message;
      expect(msg).toBe('Amount must be non-zero');
    }
  });

  it('rejects a non-numeric string with "Amount must be a valid number"', () => {
    const result = TransactionFormSchema.safeParse({ ...baseValues, amount: 'abc' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find((i) => i.path[0] === 'amount')?.message;
      expect(msg).toBe('Amount must be a valid number');
    }
  });
});

describe('buildTransactionPayload', () => {
  it('coerces amount string to number', () => {
    const payload = buildTransactionPayload({
      values: makeValues({ amount: '-12.5' }),
      entityName: null,
      accountName: 'Credit Card',
    });
    expect(payload.amount).toBe(-12.5);
  });

  it('coerces empty entityId to null and clears entityName', () => {
    const payload = buildTransactionPayload({
      values: makeValues({ entityId: '' }),
      entityName: 'Woolworths',
      accountName: 'Credit Card',
    });
    expect(payload.entityId).toBeNull();
    expect(payload.entityName).toBeNull();
  });

  it('keeps entityId and includes entityName when provided', () => {
    const payload = buildTransactionPayload({
      values: makeValues({ entityId: 'ent-1' }),
      entityName: 'Woolworths',
      accountName: 'Credit Card',
    });
    expect(payload.entityId).toBe('ent-1');
    expect(payload.entityName).toBe('Woolworths');
  });

  it('coerces empty notes to null', () => {
    const payload = buildTransactionPayload({
      values: makeValues({ notes: '' }),
      entityName: null,
      accountName: 'Credit Card',
    });
    expect(payload.notes).toBeNull();
  });

  it('passes non-empty notes through unchanged', () => {
    const payload = buildTransactionPayload({
      values: makeValues({ notes: 'A note' }),
      entityName: null,
      accountName: 'Credit Card',
    });
    expect(payload.notes).toBe('A note');
  });

  it('sends both the resolved display name and the id the user picked', () => {
    const payload = buildTransactionPayload({
      values: makeValues({ accountId: 'acc-debit' }),
      entityName: null,
      accountName: 'Debit Card',
    });
    expect(payload.account).toBe('Debit Card');
    expect(payload.accountId).toBe('acc-debit');
  });

  it('preserves all required fields verbatim', () => {
    const payload = buildTransactionPayload({
      values: makeValues({
        date: '2026-04-26',
        description: 'Coles Local',
        accountId: 'acc-debit',
        type: 'purchase',
        amount: '-50',
        tags: ['Groceries'],
      }),
      entityName: null,
      accountName: 'Debit Card',
    });
    expect(payload).toEqual({
      date: '2026-04-26',
      description: 'Coles Local',
      account: 'Debit Card',
      accountId: 'acc-debit',
      type: 'purchase',
      amount: -50,
      tags: ['Groceries'],
      entityId: null,
      entityName: null,
      notes: null,
    });
  });
});

function mockMutation() {
  return { mutate: vi.fn() };
}

describe('buildSubmit — account name fallback', () => {
  it('uses the resolved account name when the accounts query has it', () => {
    const updateMutation = mockMutation();
    const submit = buildSubmit({
      editingTransaction: makeTransaction({ account: 'Everyday Checking' }),
      createMutation: mockMutation(),
      updateMutation,
      resolveEntityName: () => null,
      resolveAccountName: () => 'Everyday Checking',
    });

    submit(makeValues());

    expect(updateMutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ account: 'Everyday Checking' }) })
    );
  });

  it('falls back to the transaction being edited’s existing account name rather than blanking it when the accounts query has not resolved the id yet', () => {
    // POPS-2776 review-findings-gate finding: resolveAccountName returns null
    // (not yet loaded / not found) while editing a transaction whose account
    // id is otherwise valid — submitting must not silently blank the legacy
    // display-name column.
    const updateMutation = mockMutation();
    const submit = buildSubmit({
      editingTransaction: makeTransaction({ account: 'Everyday Checking' }),
      createMutation: mockMutation(),
      updateMutation,
      resolveEntityName: () => null,
      resolveAccountName: () => null,
    });

    submit(makeValues());

    expect(updateMutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ account: 'Everyday Checking' }) })
    );
  });

  it('falls back to an empty string when creating (no prior transaction) and the account cannot be resolved', () => {
    const createMutation = mockMutation();
    const submit = buildSubmit({
      editingTransaction: null,
      createMutation,
      updateMutation: mockMutation(),
      resolveEntityName: () => null,
      resolveAccountName: () => null,
    });

    submit(makeValues());

    expect(createMutation.mutate).toHaveBeenCalledWith(expect.objectContaining({ account: '' }));
  });
});

describe('useTransactionsPage — isSubmitting', () => {
  it('stays false while the accounts query is still loading, so Cancel is never blocked by an unrelated fetch', () => {
    // Regression test for the isSubmitting/Cancel-gating review finding: only
    // create/update mutations in flight should disable Cancel, not the
    // accounts query's own (unrelated) loading state.
    accountsListMock.mockReturnValue(new Promise(() => {}));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactionsPage(), { wrapper });

    expect(result.current.isSubmitting).toBe(false);
  });
});

describe('useTransactionsPage — list query', () => {
  it('issues a transactions list query with the page-size limit and exposes available tags', async () => {
    transactionsAvailableTagsMock.mockResolvedValue({
      data: { tags: ['Groceries', 'Fuel'] },
      error: undefined,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactionsPage(), { wrapper });

    await waitFor(() =>
      expect(transactionsListMock).toHaveBeenCalledWith({ query: { limit: 500, offset: 0 } })
    );
    await waitFor(() => expect(result.current.availableTags).toEqual(['Groceries', 'Fuel']));
  });

  it('follows hasMore to fetch every transaction beyond the first page', async () => {
    const older = makeTransaction({ id: 'txn-old', description: 'Old Transaction' });
    const newer = makeTransaction({ id: 'txn-new', description: 'New Transaction' });
    transactionsListMock
      .mockResolvedValueOnce({
        data: { data: [newer], pagination: { total: 2, limit: 1, offset: 0, hasMore: true } },
        error: undefined,
      })
      .mockResolvedValueOnce({
        data: { data: [older], pagination: { total: 2, limit: 1, offset: 1, hasMore: false } },
        error: undefined,
      });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactionsPage(), { wrapper });

    await waitFor(() => expect(result.current.query.data?.data).toEqual([newer, older]));
    expect(result.current.query.data?.pagination.total).toBe(2);
    expect(transactionsListMock).toHaveBeenCalledTimes(2);
  });
});

describe('useTransactionsPage — onSubmit (create)', () => {
  it('builds a payload with parsed amount and null entity for new transactions', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactionsPage(), { wrapper });

    act(() => {
      result.current.onSubmit(makeValues({ amount: '-87.45', notes: '' }));
    });

    await waitFor(() =>
      expect(transactionsCreateMock).toHaveBeenCalledWith({
        body: expect.objectContaining({
          amount: -87.45,
          entityId: null,
          entityName: null,
          notes: null,
        }),
      })
    );
    expect(transactionsUpdateMock).not.toHaveBeenCalled();
  });

  it('resolves entity name from the entities list when entityId is set', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactionsPage(), { wrapper });

    // Entity-name resolution reads the async contacts entities list — wait for it.
    await waitFor(() => expect(result.current.entities).toHaveLength(2));
    act(() => {
      result.current.onSubmit(makeValues({ entityId: 'ent-1' }));
    });

    await waitFor(() =>
      expect(transactionsCreateMock).toHaveBeenCalledWith({
        body: expect.objectContaining({ entityId: 'ent-1', entityName: 'Woolworths' }),
      })
    );
  });

  it('falls back to null entityName when entityId is not in the entities list', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactionsPage(), { wrapper });

    act(() => {
      result.current.onSubmit(makeValues({ entityId: 'ent-unknown' }));
    });

    await waitFor(() =>
      expect(transactionsCreateMock).toHaveBeenCalledWith({
        body: expect.objectContaining({ entityId: 'ent-unknown', entityName: null }),
      })
    );
  });

  it('resolves the account display name from the accounts list for the id the user picked', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactionsPage(), { wrapper });

    await waitFor(() => expect(result.current.accounts).toHaveLength(2));
    act(() => {
      result.current.onSubmit(makeValues({ accountId: 'acc-debit' }));
    });

    await waitFor(() =>
      expect(transactionsCreateMock).toHaveBeenCalledWith({
        body: expect.objectContaining({ account: 'Debit Card', accountId: 'acc-debit' }),
      })
    );
  });
});

describe('useTransactionsPage — onSubmit (update)', () => {
  it('routes to update when an item is being edited', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactionsPage(), { wrapper });

    // Entity-name resolution reads the async contacts entities list — wait for it.
    await waitFor(() => expect(result.current.entities).toHaveLength(2));
    act(() => {
      result.current.handleEdit(makeTransaction({ id: 'txn-42' }));
    });
    act(() => {
      result.current.onSubmit(
        makeValues({ amount: '-99.99', entityId: 'ent-2', notes: 'Updated notes' })
      );
    });

    await waitFor(() =>
      expect(transactionsUpdateMock).toHaveBeenCalledWith({
        path: { id: 'txn-42' },
        body: expect.objectContaining({
          amount: -99.99,
          entityId: 'ent-2',
          entityName: 'Coles',
          notes: 'Updated notes',
        }),
      })
    );
    expect(transactionsCreateMock).not.toHaveBeenCalled();
  });

  it('clears entityName when entityId is cleared on update', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactionsPage(), { wrapper });

    act(() => {
      result.current.handleEdit(makeTransaction({ id: 'txn-42', entityId: 'ent-1' }));
    });
    act(() => {
      result.current.onSubmit(makeValues({ entityId: '' }));
    });

    await waitFor(() =>
      expect(transactionsUpdateMock).toHaveBeenCalledWith({
        path: { id: 'txn-42' },
        body: expect.objectContaining({ entityId: null, entityName: null }),
      })
    );
  });
});

describe('useTransactionsPage — handleEdit prefill', () => {
  it('resets form to the transaction values, including entity id', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactionsPage(), { wrapper });

    act(() => {
      result.current.handleEdit(
        makeTransaction({ id: 'txn-42', amount: -123.45, entityId: 'ent-1' })
      );
    });

    expect(result.current.form.getValues()).toEqual({
      date: '2026-02-10',
      amount: '-123.45',
      description: 'Woolworths Metro',
      accountId: 'acc-credit',
      type: 'purchase',
      entityId: 'ent-1',
      tags: ['Groceries'],
      notes: 'Weekly shop',
    });
    expect(result.current.editingTransaction?.id).toBe('txn-42');
  });

  it('treats null notes/entity as empty strings on form prefill', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactionsPage(), { wrapper });

    act(() => {
      result.current.handleEdit(makeTransaction({ id: 'txn-42', entityId: null, notes: null }));
    });

    const values = result.current.form.getValues();
    expect(values.entityId).toBe('');
    expect(values.notes).toBe('');
  });

  it('falls back to "purchase" when transaction.type is empty', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactionsPage(), { wrapper });

    act(() => {
      result.current.handleEdit(makeTransaction({ id: 'txn-42', type: '' }));
    });

    expect(result.current.form.getValues().type).toBe('purchase');
  });
});

describe('useTransactionsPage — delete', () => {
  it('exposes a setDeletingTx setter that does not auto-fire the delete mutation', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactionsPage(), { wrapper });
    const tx = makeTransaction({ id: 'txn-42' });

    act(() => {
      result.current.setDeletingTx(tx);
    });

    expect(result.current.deletingTx).toBe(tx);
    expect(transactionsDeleteMock).not.toHaveBeenCalled();
  });

  it('confirmDelete invokes transactionsDelete with the staged id', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactionsPage(), { wrapper });
    const tx = makeTransaction({ id: 'txn-42' });

    act(() => {
      result.current.confirmDelete(tx);
    });

    await waitFor(() =>
      expect(transactionsDeleteMock).toHaveBeenCalledWith({ path: { id: 'txn-42' } })
    );
  });

  it('confirmUnlink invokes transactionsUnlinkTransfer with the row id', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactionsPage(), { wrapper });
    const tx = makeTransaction({ id: 'txn-99', relatedTransactionId: 'txn-100' });

    act(() => {
      result.current.confirmUnlink(tx);
    });

    await waitFor(() =>
      expect(transactionsUnlinkTransferMock).toHaveBeenCalledWith({ path: { id: 'txn-99' } })
    );
  });
});
