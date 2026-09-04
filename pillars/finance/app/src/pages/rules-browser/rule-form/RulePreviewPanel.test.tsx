import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RulePreviewPanel } from './RulePreviewPanel';

import type { RulePreviewMatch, RulePreviewResult } from './types';

const mockAccountsList = vi.fn();
const mockInstitutionsList = vi.fn();

vi.mock('../../../finance-api/index.js', () => ({
  accountsList: (...args: unknown[]) => mockAccountsList(...args),
  institutionsList: (...args: unknown[]) => mockInstitutionsList(...args),
}));

function makeMatch(overrides: Partial<RulePreviewMatch> = {}): RulePreviewMatch {
  return {
    id: 'txn-1',
    description: 'WOOLWORTHS 1234',
    accountId: 'a1',
    amount: -12.5,
    date: '2026-04-01',
    entityName: null,
    tags: [],
    ...overrides,
  };
}

function makeResult(matches: RulePreviewMatch[]): RulePreviewResult {
  return { matches, total: matches.length, scanned: matches.length, truncated: false };
}

function renderPanel(data: RulePreviewResult | undefined) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(
    <RulePreviewPanel
      preview={{
        data,
        isFetching: false,
        error: null,
        refetch: vi.fn(),
        inputPattern: 'WOOLWORTHS',
        inputMatchType: 'contains',
        isIdle: false,
      }}
    />,
    { wrapper }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInstitutionsList.mockResolvedValue({ data: { data: [] }, error: undefined });
});

describe('RulePreviewPanel — account resolution', () => {
  it('renders the resolved account chip once the accounts list loads', async () => {
    mockAccountsList.mockResolvedValue({
      data: {
        data: [
          {
            id: 'a1',
            name: 'Up Everyday',
            institutionId: null,
            kind: 'checking',
            currency: 'AUD',
            archivedAt: null,
            displayOrder: 0,
            entityId: null,
            entityDisplayName: null,
            entityDisplayNameStale: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        pagination: { total: 1, limit: 500, offset: 0, hasMore: false },
      },
      error: undefined,
    });

    renderPanel(makeResult([makeMatch({ accountId: 'a1' })]));

    expect(await screen.findByText('Up Everyday')).toBeInTheDocument();
  });

  it('falls back to the raw account id while the accounts list is still loading', () => {
    mockAccountsList.mockReturnValue(new Promise(() => {}));

    renderPanel(makeResult([makeMatch({ accountId: 'a1' })]));

    expect(screen.getByText('a1')).toBeInTheDocument();
  });
});
