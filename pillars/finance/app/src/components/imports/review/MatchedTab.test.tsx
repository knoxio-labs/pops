import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { groupTransactionsByEntity } from '../../../lib/transaction-utils';
import { MatchedTab } from './MatchedTab';

import type { ProcessedTransaction } from '../../../store/importStore';
import type { ReviewTabBaseProps } from './ReviewTabShared';

vi.mock('../EditableTransactionCard', () => ({ EditableTransactionCard: () => null }));

function matchedTx(i: number, entityName: string): ProcessedTransaction {
  return {
    date: '2026-01-15',
    description: `${entityName.toUpperCase()} ${i}`,
    amount: -(10 + i),
    dialectAccountLabel: 'Amex',
    rawRow: '{}',
    checksum: `chk-${entityName}-${i}`,
    transactionType: 'purchase',
    entity: { entityId: `ent-${entityName}`, entityName, matchType: 'learned', confidence: 1 },
    status: 'matched',
    suggestedTags: [],
  };
}

/** `count` rows spread round-robin across `entities` merchants. */
function matchedRows(count: number, entities: string[]): ProcessedTransaction[] {
  return Array.from({ length: count }, (_, i) => {
    const entityName = entities[i % entities.length] ?? 'Unknown';
    return matchedTx(i, entityName);
  });
}

function renderTab(
  transactions: ProcessedTransaction[],
  overrides: Partial<ReviewTabBaseProps> = {}
) {
  const props: ReviewTabBaseProps = {
    transactions,
    groups: groupTransactionsByEntity(transactions, 'size'),
    viewMode: 'grouped',
    onViewModeChange: vi.fn(),
    onEntitySelect: vi.fn(),
    onBulkEntitySelect: vi.fn(),
    onCreateEntityWithName: vi.fn(),
    onAcceptAiSuggestion: vi.fn(),
    onAcceptAll: vi.fn(),
    onCreateAndAssignAll: vi.fn(),
    onEdit: vi.fn(),
    editingTransaction: null,
    onSaveEdit: vi.fn(),
    onCancelEdit: vi.fn(),
    entities: [
      { id: 'ent-Woolworths', name: 'Woolworths' },
      { id: 'ent-Coles', name: 'Coles' },
      { id: 'ent-Bunnings', name: 'Bunnings' },
    ],
    ...overrides,
  };
  return { ...render(<MatchedTab {...props} />), props };
}

describe('MatchedTab (POPS-2448)', () => {
  it('groups by entity with a count per group, largest first, and collapsed', () => {
    const rows = [
      ...matchedRows(5, ['Woolworths']),
      ...matchedRows(2, ['Coles']),
      ...matchedRows(3, ['Bunnings']),
    ];
    renderTab(rows);

    const groups = screen.getAllByTestId('transaction-group');
    expect(groups.map((g) => within(g).getByRole('heading').textContent)).toEqual([
      'Woolworths',
      'Bunnings',
      'Coles',
    ]);
    expect(within(groups[0] as HTMLElement).getByText('5 transactions')).toBeInTheDocument();
    expect(screen.queryAllByTestId('transaction-card')).toHaveLength(0);
  });

  it('renders only group headers for a large import until a group is expanded', () => {
    const merchants = Array.from({ length: 30 }, (_, i) => `Merchant ${i}`);
    const rows = matchedRows(1200, merchants);
    renderTab(rows, { entities: merchants.map((name) => ({ id: `ent-${name}`, name })) });

    expect(screen.getAllByTestId('transaction-group')).toHaveLength(30);
    expect(screen.queryAllByTestId('transaction-card')).toHaveLength(0);

    fireEvent.click(screen.getAllByRole('button', { name: 'Expand' })[7] as HTMLElement);
    expect(screen.getAllByTestId('transaction-card')).toHaveLength(40);
  });

  it('keeps the largest group first even when a smaller one was matched by the AI', () => {
    const rows = [
      ...matchedRows(1, ['Coles']).map((t) => ({
        ...t,
        entity: { ...t.entity, matchType: 'ai' as const },
      })),
      ...matchedRows(4, ['Woolworths']),
    ];
    renderTab(rows);

    const groups = screen.getAllByTestId('transaction-group');
    expect(groups.map((g) => within(g).getByRole('heading').textContent)).toEqual([
      'Woolworths',
      'Coles',
    ]);
  });

  it('offers Reassign all and never Accept all, even for a group the AI matched', () => {
    const rows = matchedRows(3, ['Woolworths']).map((t) => ({
      ...t,
      entity: { ...t.entity, matchType: 'ai' as const },
    }));
    renderTab(rows);

    expect(screen.getByRole('button', { name: 'Reassign all...' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /assign all to|create/i })).not.toBeInTheDocument();
  });

  it('reassigns the whole group through the bulk handler', async () => {
    const user = userEvent.setup();
    const rows = matchedRows(4, ['Woolworths']);
    const { props } = renderTab(rows);

    await user.click(screen.getByRole('button', { name: 'Reassign all...' }));
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('Coles'));

    expect(props.onBulkEntitySelect).toHaveBeenCalledWith(rows, 'ent-Coles', 'Coles');
  });

  it('list view still shows every row in order', () => {
    const rows = matchedRows(6, ['Woolworths', 'Coles']);
    renderTab(rows, { viewMode: 'list' });

    expect(screen.queryAllByTestId('transaction-group')).toHaveLength(0);
    expect(
      screen.getAllByTestId('transaction-card').map((c) => c.getAttribute('aria-label'))
    ).toEqual(rows.map((r) => r.description));
  });

  it('says so when nothing matched', () => {
    renderTab([]);
    expect(screen.getByText('No matched transactions')).toBeInTheDocument();
  });
});
