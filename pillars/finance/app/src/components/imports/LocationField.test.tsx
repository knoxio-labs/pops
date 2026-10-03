import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { LocationField } from './LocationField';

import type { ProcessedTransaction } from '@pops/finance';

function transaction(overrides: Partial<ProcessedTransaction> = {}): ProcessedTransaction {
  return {
    date: '2026-04-01',
    description: 'CAFE 1234',
    amount: -12.34,
    dialectAccountLabel: 'Everyday',
    rawRow: JSON.stringify({ 'Town/City': 'Sydney' }),
    checksum: 'abc',
    location: 'Sydney',
    entity: { matchType: 'learned', confidence: 0.9, entityId: 'ent_1', entityName: 'Cafe' },
    status: 'matched',
    ...overrides,
  };
}

describe('LocationField', () => {
  it('exposes extraction details without hover and opens them on tap', async () => {
    const user = userEvent.setup();
    render(<LocationField transaction={transaction()} />);

    const trigger = screen.getByRole('button', {
      name: 'Location details: Town/City: Sydney. Confidence: high',
    });
    expect(trigger).toBeInTheDocument();

    await user.click(trigger);
    const popover = await screen.findByRole('dialog');
    expect(within(popover).getByText('Town/City: Sydney')).toBeInTheDocument();
    expect(within(popover).getByText('Confidence: high')).toBeInTheDocument();
  });
});
