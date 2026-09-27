import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { planMove } from '../move-plan/move-plan-model.js';
import { coreWorld } from '../test-fixtures/core.js';
import { shelvingTarget } from '../test-fixtures/placements.js';
import { BulkMoveSheet } from './bulk-move-sheet.js';

vi.mock('../../inventory-web/usePlacementSources.js', () => ({
  usePlacementSources: vi.fn(),
}));

describe('BulkMoveSheet', () => {
  it('derives the selected count and renders the controlled move panel', () => {
    const onOpenChange = vi.fn();
    const onApply = vi.fn();
    const onChangeTarget = vi.fn();
    const plan = planMove({ world: coreWorld, selectedIds: ['itm-lamp'], target: shelvingTarget });

    render(
      <BulkMoveSheet
        open
        onOpenChange={onOpenChange}
        plan={plan}
        world={coreWorld}
        busy={false}
        onApply={onApply}
        onChangeTarget={onChangeTarget}
      />
    );

    expect(screen.getByRole('heading', { name: 'Move 1 selected' })).toBeInTheDocument();
    expect(screen.getByText('Containers take their contents with them.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: /^Move/ }));

    expect(onChangeTarget).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onApply).toHaveBeenCalledOnce();
  });

  it('does not render while closed and forwards busy state to the panel', () => {
    const plan = planMove({ world: coreWorld, selectedIds: ['itm-lamp'], target: shelvingTarget });
    const { rerender } = render(
      <BulkMoveSheet
        open={false}
        onOpenChange={vi.fn()}
        plan={plan}
        world={coreWorld}
        busy={false}
        onApply={vi.fn()}
        onChangeTarget={vi.fn()}
      />
    );
    expect(screen.queryByRole('heading', { name: 'Move 1 selected' })).not.toBeInTheDocument();

    rerender(
      <BulkMoveSheet
        open
        onOpenChange={vi.fn()}
        plan={plan}
        world={coreWorld}
        busy
        onApply={vi.fn()}
        onChangeTarget={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Loading' })).toBeDisabled();
  });
});
