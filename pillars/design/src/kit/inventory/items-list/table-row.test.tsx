import { coreItem, coreWorld } from '@/fixtures/inventory/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TableRow } from './table-row';

describe('TableRow actions', () => {
  it('offers Edit beside the row menu', () => {
    const onEdit = vi.fn();
    render(
      <TableRow
        item={coreItem('itm-drill')}
        world={coreWorld}
        density="default"
        selected={false}
        focused={false}
        onEdit={onEdit}
      />
    );

    const edit = screen.getByRole('button', { name: 'Edit' });
    expect(edit).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();

    fireEvent.click(edit);

    expect(onEdit).toHaveBeenCalledWith('itm-drill');
  });
});
