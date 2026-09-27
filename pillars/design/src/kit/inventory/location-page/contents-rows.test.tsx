import { coreItem, coreWorld } from '@/fixtures/inventory/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ContentsItemRow } from './contents-rows';

describe('ContentsItemRow actions', () => {
  it('calls onEdit for the edited item', () => {
    const item = coreItem('itm-drill');
    const onEdit = vi.fn();

    render(<ContentsItemRow item={item} ctx={{ world: coreWorld, onEdit }} />);

    fireEvent.click(screen.getByRole('button', { name: `Edit ${item.name}` }));

    expect(onEdit).toHaveBeenCalledWith(item.id);
  });
});
