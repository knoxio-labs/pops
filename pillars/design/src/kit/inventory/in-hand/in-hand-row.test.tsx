import { coreItem, coreWorld } from '@/fixtures/inventory/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InHandRow } from './in-hand-row';

describe('InHandRow actions', () => {
  it('calls onEdit for the edited item', () => {
    const item = coreItem('itm-tape');
    const onEdit = vi.fn();

    render(<InHandRow item={item} world={coreWorld} selected={false} onEdit={onEdit} />);

    fireEvent.click(screen.getByRole('button', { name: `Edit ${item.name}` }));

    expect(onEdit).toHaveBeenCalledWith(item.id);
  });
});
