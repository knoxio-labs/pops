import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RuleMatchList } from './RuleMatchList';

import type { ReactNode } from 'react';

import type { CorrectionRule } from '../../RulePicker';

const correctionsRuleMatchPreview = vi.fn();

vi.mock('../../../../finance-api/index.js', () => ({
  correctionsRuleMatchPreview: (...args: unknown[]) => correctionsRuleMatchPreview(...args),
}));

interface PreviewMatch {
  id: string;
  checksum: string | null;
  date: string;
  description: string;
  amount: number;
  entityId: string | null;
  entityName: string | null;
}

function mockPreview(matches: PreviewMatch[], totalCount: number): void {
  correctionsRuleMatchPreview.mockResolvedValue({
    data: { data: { matches, totalCount } },
    error: undefined,
    response: new Response(),
  });
}

function makeRule(overrides: Partial<CorrectionRule> = {}): CorrectionRule {
  return {
    id: 'rule-1',
    descriptionPattern: 'STARBUCKS',
    matchType: 'contains',
    entityId: 'ent-rule',
    entityName: 'Starbucks',
    location: null,
    tags: [],
    transactionType: null,
    isActive: true,
    priority: 0,
    confidence: 0.9,
    timesApplied: 3,
    createdAt: '2025-01-01T00:00:00.000Z',
    lastUsedAt: null,
    ...overrides,
  };
}

function renderList(rule: CorrectionRule): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<RuleMatchList rule={rule} />, { wrapper });
}

describe('RuleMatchList', () => {
  beforeEach(() => {
    correctionsRuleMatchPreview.mockReset();
  });

  it('renders the matched transactions across the DB with the full total', async () => {
    mockPreview(
      [
        {
          id: 't1',
          checksum: 'c1',
          date: '2025-03-02',
          description: 'STARBUCKS SYDNEY',
          amount: -5.5,
          entityId: 'ent-other',
          entityName: 'Uncategorised Cafe',
        },
        {
          id: 't2',
          checksum: 'c2',
          date: '2025-03-01',
          description: 'STARBUCKS MELBOURNE',
          amount: -6.25,
          entityId: 'ent-rule',
          entityName: 'Starbucks',
        },
      ],
      2
    );

    renderList(makeRule());

    expect(await screen.findByText('STARBUCKS SYDNEY')).toBeInTheDocument();
    expect(screen.getByText('STARBUCKS MELBOURNE')).toBeInTheDocument();
    expect(screen.getByText('Uncategorised Cafe')).toBeInTheDocument();
    expect(screen.getByTestId('rule-match-total')).toHaveTextContent('2');

    // The row whose current entity differs from the rule's target "would change";
    // the one that already carries the rule's entity is "already correct".
    expect(screen.getByText('would change')).toBeInTheDocument();
    expect(screen.getByText('already correct')).toBeInTheDocument();

    // The rule's own pattern/matchType drive the query — faithful to what fires.
    expect(correctionsRuleMatchPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ pattern: 'STARBUCKS', matchType: 'contains' }),
      })
    );
  });

  it('reports the full DB total and flags a truncated page when it exceeds the page size', async () => {
    mockPreview(
      [
        {
          id: 't1',
          checksum: null,
          date: '2025-03-02',
          description: 'STARBUCKS ONE',
          amount: -5,
          entityId: null,
          entityName: null,
        },
      ],
      4200
    );

    renderList(makeRule());

    expect(await screen.findByTestId('rule-match-total')).toHaveTextContent('4200');
    expect(screen.getByTestId('rule-match-truncated')).toHaveTextContent('showing first 1 of 4200');
  });

  it('shows an empty state when the rule matches nothing in the DB', async () => {
    mockPreview([], 0);

    renderList(makeRule({ descriptionPattern: 'NEVERMATCH' }));

    expect(await screen.findByTestId('rule-match-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('rule-match-row')).not.toBeInTheDocument();
  });
});
