import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useImportStore } from '../../../../store/importStore';
import { RuleMatchList } from './RuleMatchList';

import type { ReactNode } from 'react';

import type { ProcessedTransaction } from '../../../../store/import-store-types';
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
    accountId: null,
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

function makeMatchedTx(overrides: Partial<ProcessedTransaction> = {}): ProcessedTransaction {
  return {
    date: '2026-01-15',
    description: 'STARBUCKS MELBOURNE',
    amount: -6.25,
    dialectAccountLabel: 'Amex',
    rawRow: '{}',
    checksum: 'chk-1',
    entity: { entityId: 'ent-rule', entityName: 'Starbucks', matchType: 'learned' },
    status: 'matched',
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

  afterEach(() => {
    useImportStore.setState({
      processedTransactions: { matched: [], uncertain: [], failed: [], skipped: [] },
    });
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

    // The row whose current entity differs from the rule's target reads
    // "entity changes"; the one that already carries the rule's entity reads
    // "entity matches". The badge speaks only to the entity, not tags/type.
    expect(screen.getByText('entity changes')).toBeInTheDocument();
    expect(screen.getByText('entity matches')).toBeInTheDocument();

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

  it('reports in-session matches instead of a flat zero when the rule has not reached the DB yet', async () => {
    mockPreview([], 0);
    useImportStore.setState({
      processedTransactions: {
        matched: [
          makeMatchedTx({
            ruleProvenance: {
              source: 'correction',
              ruleId: 'rule-1',
              pattern: 'STARBUCKS',
              matchType: 'contains',
              confidence: null,
            },
          }),
          makeMatchedTx({
            description: 'STARBUCKS SYDNEY',
            matchedRules: [
              {
                ruleId: 'rule-1',
                pattern: 'STARBUCKS',
                matchType: 'contains',
                confidence: null,
                priority: 0,
              },
            ],
          }),
          makeMatchedTx({
            description: 'COLES 123',
            ruleProvenance: undefined,
            matchedRules: undefined,
          }),
        ],
        uncertain: [],
        failed: [],
        skipped: [],
      },
    });

    renderList(makeRule());

    expect(await screen.findByTestId('rule-match-empty-session')).toHaveTextContent(
      'No committed transactions match yet — 2 in this import already do.'
    );
    expect(screen.queryByTestId('rule-match-empty')).not.toBeInTheDocument();
  });

  it('ignores in-session matches belonging to a different rule when the DB has none for this one', async () => {
    mockPreview([], 0);
    useImportStore.setState({
      processedTransactions: {
        matched: [
          makeMatchedTx({
            ruleProvenance: {
              source: 'correction',
              ruleId: 'rule-other',
              pattern: 'COLES',
              matchType: 'contains',
              confidence: null,
            },
          }),
        ],
        uncertain: [],
        failed: [],
        skipped: [],
      },
    });

    renderList(makeRule());

    expect(await screen.findByTestId('rule-match-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('rule-match-empty-session')).not.toBeInTheDocument();
  });
});
