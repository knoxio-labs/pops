import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../model/placement-model';
import { coreWorld } from '../test-fixtures/core';
import { at, box } from '../test-fixtures/core-factory';
import { closedBoxTarget, deskTarget, shelvingTarget } from '../test-fixtures/placements';
import { MovePlanPanel } from './move-plan';
import { planMove } from './move-plan-model';

const fullContainer = box(['full', 'Full box', 'type-box'], at('loc-garage'), 'open', {
  full: true,
});
const fullWorld = buildWorld(
  [...coreWorld.items.values(), fullContainer],
  [...coreWorld.locations.values()]
);
const fullTarget = { kind: 'container', containerId: 'full' } as const;

describe('MovePlanPanel', () => {
  it('the Move button counts carried contents', () => {
    const plan = planMove({
      world: coreWorld,
      selectedIds: ['box-cables'],
      target: deskTarget,
    });

    render(<MovePlanPanel plan={plan} world={coreWorld} />);

    expect(screen.getByText('Desk')).toBeInTheDocument();
    expect(screen.getByText('4 items end up in Desk')).toBeInTheDocument();
    expect(screen.getByText('1 selected, 3 inside them')).toBeInTheDocument();
    expect(screen.getByText('Cable tub')).toBeInTheDocument();
    expect(screen.getByText('Moves')).toBeInTheDocument();
    expect(screen.getAllByText('In Cable tub')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Move 4 items' })).toBeEnabled();
  });

  it('uses the carried padding while retaining the row padding base', () => {
    const plan = planMove({
      world: coreWorld,
      selectedIds: ['box-cables'],
      target: deskTarget,
    });

    render(<MovePlanPanel plan={plan} world={coreWorld} />);

    const carriedRow = screen.getByText('Laptop charger').closest('li');
    expect(carriedRow).not.toBeNull();
    expect(carriedRow).toHaveClass('pr-3', 'pl-8');
  });

  it('a full target warns and still allows the move', () => {
    const plan = planMove({
      world: fullWorld,
      selectedIds: ['itm-lamp'],
      target: fullTarget,
    });

    render(<MovePlanPanel plan={plan} world={fullWorld} />);

    expect(screen.getByText(/Full box is marked full/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move 1 item' })).toBeEnabled();
  });

  it('a refused target disables Move and names the fix', () => {
    const plan = planMove({
      world: coreWorld,
      selectedIds: ['itm-lamp'],
      target: closedBoxTarget,
    });

    render(<MovePlanPanel plan={plan} world={coreWorld} />);

    expect(screen.getByText('Office 04 is closed. Open it first.')).toBeInTheDocument();
    expect(screen.getByText('Nothing moves until the target can take it.')).toBeInTheDocument();
    expect(screen.getByText('Would move')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
  });

  it('a plan with nothing to move disables Move', () => {
    const plan = planMove({
      world: coreWorld,
      selectedIds: ['itm-lamp'],
      target: deskTarget,
    });

    render(<MovePlanPanel plan={plan} world={coreWorld} />);

    expect(screen.getByText('Already there')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
  });

  it('renders blockers and keeps a mixed plan applicable', () => {
    const plan = planMove({
      world: coreWorld,
      selectedIds: ['itm-lamp', 'itm-speaker'],
      target: shelvingTarget,
    });

    render(<MovePlanPanel plan={plan} world={coreWorld} />);

    expect(screen.getByText('Stays')).toBeInTheDocument();
    expect(screen.getByText('Discarded. Restore it first.')).toBeInTheDocument();
    expect(screen.getByText('1 selected, 1 cannot move')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move 1 item' })).toBeEnabled();
  });

  it('keeps target change, cancel, and apply callbacks separate', () => {
    const onApply = vi.fn();
    const onCancel = vi.fn();
    const onChangeTarget = vi.fn();
    const plan = planMove({
      world: coreWorld,
      selectedIds: ['itm-lamp'],
      target: shelvingTarget,
    });

    render(
      <MovePlanPanel
        plan={plan}
        world={coreWorld}
        onApply={onApply}
        onCancel={onCancel}
        onChangeTarget={onChangeTarget}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move 1 item' }));

    expect(onChangeTarget).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onApply).toHaveBeenCalledOnce();
  });

  it('shows no Change button without onChangeTarget', () => {
    const plan = planMove({
      world: coreWorld,
      selectedIds: ['itm-lamp'],
      target: shelvingTarget,
    });

    render(<MovePlanPanel plan={plan} world={coreWorld} />);

    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
  });

  it('busy disables Cancel and Move', () => {
    const plan = planMove({
      world: coreWorld,
      selectedIds: ['itm-lamp'],
      target: shelvingTarget,
    });

    render(<MovePlanPanel plan={plan} world={coreWorld} busy onCancel={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Loading' })).toBeDisabled();
  });
});
