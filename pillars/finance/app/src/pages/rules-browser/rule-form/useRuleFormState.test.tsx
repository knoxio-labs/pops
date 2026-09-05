/**
 * POPS-2593 — the rule form is the ONLY writer of a non-null account scope.
 *
 * Every automated proposer emits `null`; narrowing a rule is an operator act,
 * so these tests pin that the form defaults to "any account", carries an
 * operator's pick through to both the create and the update payload, and seeds
 * an existing rule's scope back into the form when it opens for edit. A field
 * that renders but never reaches the wire would look correct and change
 * nothing.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRuleFormState } from './useRuleFormState';

import type { Correction } from '../types';

const correctionsCreateOrUpdate = vi.fn();
const correctionsUpdate = vi.fn();
const accountsList = vi.fn();
const institutionsList = vi.fn();

vi.mock('../../../finance-api/index.js', () => ({
  correctionsCreateOrUpdate: (...a: unknown[]) => correctionsCreateOrUpdate(...a),
  correctionsUpdate: (...a: unknown[]) => correctionsUpdate(...a),
  accountsList: (...a: unknown[]) => accountsList(...a),
  institutionsList: (...a: unknown[]) => institutionsList(...a),
}));

vi.mock('../../../lib/useAllEntities', () => ({
  useAllEntities: () => ({
    data: { data: [{ id: 'ent-bank', name: 'Bank' }] },
  }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const ACCOUNT_ID = 'acct-bank-a';

function envelope<T>(data: T) {
  return { data, error: undefined };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

function existingRule(overrides: Partial<Correction> = {}): Correction {
  return {
    id: 'rule-1',
    descriptionPattern: 'LATE FEE',
    accountId: null,
    matchType: 'exact',
    entityId: 'ent-bank',
    entityName: 'Bank',
    location: null,
    tags: [],
    transactionType: null,
    isActive: true,
    priority: 0,
    confidence: 0.9,
    timesApplied: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  accountsList.mockResolvedValue(
    envelope({
      data: [
        {
          id: ACCOUNT_ID,
          name: 'Bank A Card',
          kind: 'credit-card',
          institutionId: null,
          archivedAt: null,
        },
      ],
      pagination: { total: 1, limit: 500, offset: 0, hasMore: false },
    })
  );
  institutionsList.mockResolvedValue(envelope({ data: [] }));
  correctionsCreateOrUpdate.mockResolvedValue(envelope({ data: existingRule(), message: 'ok' }));
  correctionsUpdate.mockResolvedValue(envelope({ data: existingRule(), message: 'ok' }));
});

function renderForm() {
  return renderHook(() => useRuleFormState({ onClose: () => {} }), { wrapper });
}

describe('useRuleFormState — account scope', () => {
  it('offers the account list to the picker', async () => {
    const { result } = renderForm();

    await waitFor(() => expect(result.current.accounts).toHaveLength(1));
    expect(result.current.accounts[0]?.id).toBe(ACCOUNT_ID);
  });

  it('creates a global rule when the operator leaves the scope alone', async () => {
    const { result } = renderForm();

    act(() => {
      result.current.onSubmit({
        descriptionPattern: 'LATE FEE',
        accountId: null,
        matchType: 'exact',
        entityId: 'ent-bank',
        tags: [],
        priority: 0,
        isActive: true,
      });
    });

    await waitFor(() => expect(correctionsCreateOrUpdate).toHaveBeenCalled());
    expect(correctionsCreateOrUpdate.mock.calls[0]?.[0].body.accountId).toBeNull();
  });

  it('sends the operator’s pick through on create', async () => {
    const { result } = renderForm();

    act(() => {
      result.current.onSubmit({
        descriptionPattern: 'LATE FEE',
        accountId: ACCOUNT_ID,
        matchType: 'exact',
        entityId: 'ent-bank',
        tags: [],
        priority: 0,
        isActive: true,
      });
    });

    await waitFor(() => expect(correctionsCreateOrUpdate).toHaveBeenCalled());
    expect(correctionsCreateOrUpdate.mock.calls[0]?.[0].body.accountId).toBe(ACCOUNT_ID);
  });

  it('sends the scope on update, including widening it back to null', async () => {
    const { result } = renderForm();

    act(() => {
      result.current.handleEdit(existingRule({ accountId: ACCOUNT_ID }));
    });
    act(() => {
      result.current.onSubmit({
        descriptionPattern: 'LATE FEE',
        accountId: null,
        matchType: 'exact',
        entityId: 'ent-bank',
        tags: [],
        priority: 0,
        isActive: true,
      });
    });

    await waitFor(() => expect(correctionsUpdate).toHaveBeenCalled());
    expect(correctionsUpdate.mock.calls[0]?.[0].body.accountId).toBeNull();
  });

  it('seeds an existing rule’s scope back into the form on edit', () => {
    const { result } = renderForm();

    act(() => {
      result.current.handleEdit(existingRule({ accountId: ACCOUNT_ID }));
    });

    expect(result.current.form.getValues('accountId')).toBe(ACCOUNT_ID);
  });

  it('resets to “any account” when the form opens for a new rule', () => {
    const { result } = renderForm();

    act(() => {
      result.current.handleEdit(existingRule({ accountId: ACCOUNT_ID }));
    });
    act(() => {
      result.current.handleAdd();
    });

    expect(result.current.form.getValues('accountId')).toBeNull();
  });
});
