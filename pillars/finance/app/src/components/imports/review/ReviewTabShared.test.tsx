import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { groupTransactionsByEntity } from '../../../lib/transaction-utils';
import { ListView, type ReviewTabBaseProps } from './ReviewTabShared';

import type { ProcessedTransaction } from '../../../store/importStore';

vi.mock('../EditableTransactionCard', () => ({ EditableTransactionCard: () => null }));

function aiSuggestedTx(): ProcessedTransaction {
  return {
    date: '2026-01-15',
    description: 'CHARGEFOX 1',
    amount: -12.5,
    dialectAccountLabel: 'Amex',
    rawRow: '{}',
    checksum: 'chk-1',
    entity: { matchType: 'ai', confidence: 0.6, entityName: 'Chargefox' },
    status: 'uncertain',
    suggestedTags: [],
  };
}

function baseProps(overrides: Partial<ReviewTabBaseProps> = {}): ReviewTabBaseProps {
  const transactions = [aiSuggestedTx()];
  return {
    transactions,
    groups: groupTransactionsByEntity(transactions, 'size'),
    viewMode: 'list',
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
    entities: [{ id: 'ent-1', name: 'Chargefox' }],
    entityVerification: 'ready',
    ...overrides,
  };
}

describe('ListView — entity verification reaches the row-level accept button', () => {
  it('resolves existence instead of leaving the button stuck on checking', () => {
    render(<ListView variant="uncertain" props={baseProps()} />);

    expect(screen.getByRole('button', { name: 'Assign to "Chargefox"' })).toBeInTheDocument();
  });

  it('disables the button while verification is still checking', () => {
    render(<ListView variant="uncertain" props={baseProps({ entityVerification: 'checking' })} />);

    expect(screen.getByRole('button', { name: 'Checking "Chargefox"…' })).toBeDisabled();
  });
});
