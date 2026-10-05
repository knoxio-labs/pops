import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OpRow } from './OpRow';

import type { LocalOp } from '../types';

const DIRTY_ADD: LocalOp = {
  kind: 'add',
  clientId: 'op-1',
  data: { descriptionPattern: 'WOOLWORTHS', matchType: 'contains', tags: [] },
  dirty: true,
};

describe('OpRow preview status', () => {
  it('explains a stale preview on keyboard focus', async () => {
    const user = userEvent.setup();
    render(
      <OpRow
        op={DIRTY_ADD}
        selected={false}
        disabled={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    const status = screen.getByRole('button', { name: 'Preview status' });
    expect(status).toHaveClass('h-11', 'w-11');

    await user.tab();

    expect(status).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Unsaved edits — preview stale');
  });

  it('keeps the stale preview explanation available on pointer hover', async () => {
    const user = userEvent.setup();
    render(
      <OpRow
        op={DIRTY_ADD}
        selected={false}
        disabled={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    await user.hover(screen.getByRole('button', { name: 'Preview status' }));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Unsaved edits — preview stale');
  });
});
