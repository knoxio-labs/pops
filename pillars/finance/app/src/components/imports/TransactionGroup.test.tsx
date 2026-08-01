import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TransactionGroup } from './TransactionGroup';

import type { ProcessedTransaction } from '@pops/finance';

import type { TransactionGroup as TransactionGroupType } from '../../lib/transaction-utils';

function makeTxn(checksum: string): ProcessedTransaction {
  return {
    date: '2026-02-06',
    description: `TXN ${checksum}`,
    amount: -12.5,
    account: 'Amex',
    rawRow: `{"checksum":"${checksum}"}`,
    checksum,
    entity: { matchType: 'none' },
    status: 'uncertain',
  };
}

function makeGroup(overrides: Partial<TransactionGroupType> = {}): TransactionGroupType {
  return {
    entityName: 'Bunnings Warehouse',
    transactions: [makeTxn('a'), makeTxn('b')],
    aiSuggestion: false,
    ...overrides,
  };
}

function renderGroup(overrides: Partial<Parameters<typeof TransactionGroup>[0]> = {}) {
  return render(
    <TransactionGroup
      group={makeGroup()}
      onAcceptAll={vi.fn()}
      onCreateAndAssignAll={vi.fn()}
      onEntitySelect={vi.fn()}
      onBulkEntitySelect={vi.fn()}
      onCreateEntityWithName={vi.fn()}
      onAcceptAiSuggestion={vi.fn()}
      onEdit={vi.fn()}
      entities={[
        { id: 'ent-1', name: 'Bunnings Warehouse' },
        { id: 'ent-2', name: 'Coles' },
      ]}
      {...overrides}
    />
  );
}

describe('TransactionGroup — standardized bulk entity picker', () => {
  it('renders the searchable EntitySelect combobox (not a native <select>) for bulk assignment', async () => {
    const user = userEvent.setup();
    const { container } = renderGroup();

    await user.click(screen.getByRole('button', { name: /assign all/i }));

    expect(screen.getByText(/select entity to assign to all 2 transactions/i)).toBeInTheDocument();

    // The standardized picker is the @pops/ui EntitySelect: a combobox-role
    // *button* trigger (with aria-expanded), showing the placeholder — not the
    // legacy native <select> element.
    const trigger = screen.getByRole('combobox');
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('aria-expanded');
    expect(trigger).toHaveTextContent(/choose entity/i);
    expect(container.querySelector('select')).toBeNull();
  });

  it('does not show the picker until "Assign all" is toggled', () => {
    renderGroup();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText(/select entity to assign to all/i)).not.toBeInTheDocument();
  });

  it("offers no separate create button — creation is the picker's own row", () => {
    renderGroup({ group: makeGroup({ aiSuggestion: true }) });

    expect(screen.getByRole('button', { name: /accept all as/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create new for all/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /choose existing/i })).not.toBeInTheDocument();
  });

  it('creates and assigns a new entity named after the search term', async () => {
    const user = userEvent.setup();
    const onCreateAndAssignAll = vi.fn();
    renderGroup({ onCreateAndAssignAll });

    await user.click(screen.getByRole('button', { name: /assign all/i }));
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText(/search entities/i), 'SaunaX');
    await user.click(screen.getByText(/create “SaunaX”/i));

    expect(onCreateAndAssignAll).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ checksum: 'a' })]),
      'SaunaX'
    );
    // The picker closes onto the group once the choice is made.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('still opens the picker when no entity exists yet, so the first one can be created', async () => {
    const user = userEvent.setup();
    renderGroup({ entities: [] });

    await user.click(screen.getByRole('button', { name: /assign all/i }));

    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});
