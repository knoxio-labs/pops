import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useImportStore } from '../../store/importStore';
import { EditableTransactionCard } from './EditableTransactionCard';

import type { ProcessedTransaction } from '@pops/finance';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  useImportStore.getState().reset();
});

/** No account established on the import — `AccountField` falls back to free text. */
function renderCard(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function makeTx(overrides: Partial<ProcessedTransaction> = {}): ProcessedTransaction {
  return {
    date: '2026-04-01',
    description: 'WOOLWORTHS 1234',
    amount: -12.34,
    dialectAccountLabel: 'Everyday',
    rawRow: '{}',
    checksum: 'abc',
    location: undefined,
    entity: { matchType: 'none' },
    status: 'matched',
    transactionType: 'purchase',
    ...overrides,
  };
}

const ENTITIES = [
  { id: 'ent-1', name: 'Woolworths' },
  { id: 'ent-2', name: 'Coles' },
];

function getEntityTrigger(): HTMLElement {
  const trigger = screen.getAllByRole('combobox').find((el) => el.tagName === 'BUTTON');
  if (!trigger) throw new Error('EntitySelect combobox trigger not found');
  return trigger;
}

describe('EditableTransactionCard entity selection', () => {
  it('persists a newly selected entity into onSave', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const transaction = makeTx();

    renderCard(
      <EditableTransactionCard
        transaction={transaction}
        onSave={onSave}
        onCancel={vi.fn()}
        entities={ENTITIES}
      />
    );

    await user.click(getEntityTrigger());
    await user.click(screen.getByText('Coles'));
    await user.click(screen.getByRole('button', { name: /save once/i }));

    expect(onSave).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        entity: { entityId: 'ent-2', entityName: 'Coles', matchType: 'manual' },
      }),
      false
    );
  });

  it('seeds the entity dropdown from the transaction and keeps it on an unrelated field edit', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const transaction = makeTx({
      entity: { entityId: 'ent-1', entityName: 'Woolworths', matchType: 'exact' },
    });

    renderCard(
      <EditableTransactionCard
        transaction={transaction}
        onSave={onSave}
        onCancel={vi.fn()}
        entities={ENTITIES}
      />
    );

    expect(getEntityTrigger()).toHaveTextContent('Woolworths');

    await user.clear(screen.getByLabelText('Description'));
    await user.type(screen.getByLabelText('Description'), 'WOOLWORTHS METRO');
    await user.click(screen.getByRole('button', { name: /save once/i }));

    expect(onSave).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        description: 'WOOLWORTHS METRO',
        entity: { entityId: 'ent-1', entityName: 'Woolworths', matchType: 'exact' },
      }),
      false
    );
  });
});
