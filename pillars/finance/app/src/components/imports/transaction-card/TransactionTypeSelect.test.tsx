import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TransactionTypeSelect } from './TransactionTypeSelect';

/**
 * Regression: the forced-type prompt can be live on more than one row at
 * once (a picker opened on two different uncertain rows without confirming
 * the first), so a shared literal id would break the `<label htmlFor>`
 * association on every instance past the first.
 */
describe('TransactionTypeSelect — id uniqueness across simultaneous instances', () => {
  it('gives each unlabeled instance its own id, so both remain individually addressable', () => {
    render(
      <>
        <TransactionTypeSelect value={undefined} onChange={vi.fn()} />
        <TransactionTypeSelect value={undefined} onChange={vi.fn()} />
      </>
    );

    const selects = screen.getAllByLabelText('Transaction Type');
    expect(selects).toHaveLength(2);
    expect(selects[0]?.id).not.toBe(selects[1]?.id);
  });
});
