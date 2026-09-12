import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DroppedRowsNotice } from './DroppedRowsNotice';

import type { ProcessedTransaction } from '../../../store/importStore';

function row(overrides: Partial<ProcessedTransaction> = {}): ProcessedTransaction {
  return {
    date: '2026-01-15',
    description: 'PALMS BAR AND PUB',
    amount: -42.5,
    dialectAccountLabel: 'Amex',
    rawRow: '{}',
    checksum: 'chk-1',
    transactionType: 'purchase',
    entity: { entityId: 'pending:contact:palms', entityName: 'Palms Bar', matchType: 'learned' },
    status: 'matched',
    suggestedTags: [],
    ...overrides,
  };
}

describe('DroppedRowsNotice (POPS-3659)', () => {
  it('renders nothing when every matched row commits', () => {
    const { container } = render(<DroppedRowsNotice dropped={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names each dropped row with its date, amount and what it is missing', () => {
    render(
      <DroppedRowsNotice
        dropped={[
          row({
            checksum: 'a',
            description: 'REFUND FROM APPLE',
            amount: 139.72,
            transactionType: undefined,
          }),
          row({ checksum: 'b', description: 'PALMS BAR AND PUB' }),
        ]}
      />
    );

    const listed = within(screen.getByTestId('dropped-rows')).getAllByRole('listitem');
    expect(listed).toHaveLength(2);
    expect(listed[0]).toHaveTextContent('REFUND FROM APPLE');
    expect(listed[0]).toHaveTextContent('2026-01-15 • $139.72');
    expect(listed[0]).toHaveTextContent('needs a transaction type');
    expect(listed[1]).toHaveTextContent('needs a merchant');
  });

  it('caps the named rows and counts the rest', () => {
    const dropped = Array.from({ length: 8 }, (_, i) =>
      row({ checksum: `chk-${i}`, description: `ROW ${i}` })
    );
    render(<DroppedRowsNotice dropped={dropped} />);

    const listed = within(screen.getByTestId('dropped-rows')).getAllByRole('listitem');
    expect(listed).toHaveLength(6);
    expect(listed.at(-1)).toHaveTextContent('and 3 more');
    expect(screen.queryByText(/ROW 5/)).not.toBeInTheDocument();
  });

  it('offers to reveal the rows, and does not when nothing can navigate', async () => {
    const user = userEvent.setup();
    const onShowDropped = vi.fn();
    const { rerender } = render(
      <DroppedRowsNotice dropped={[row()]} onShowDropped={onShowDropped} />
    );

    await user.click(screen.getByRole('button', { name: 'Show this row' }));
    expect(onShowDropped).toHaveBeenCalledTimes(1);

    rerender(<DroppedRowsNotice dropped={[row()]} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
