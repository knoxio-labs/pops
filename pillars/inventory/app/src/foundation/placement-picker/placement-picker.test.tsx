import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { coreWorld } from '../test-fixtures/core';
import { recentPlacements } from '../test-fixtures/recents';
import { PlacementPicker, PlacementPickerPanel } from './placement-picker';

import type { PlacementPickerProps } from '../model/contracts';

function props(overrides: Partial<PlacementPickerProps> = {}): PlacementPickerProps {
  return {
    world: coreWorld,
    subject: { kind: 'items', ids: ['itm-lamp'] },
    recents: recentPlacements,
    onPick: vi.fn(),
    onCreatePlace: vi.fn(),
    initialDrillId: null,
    ...overrides,
  };
}

describe('PlacementPickerPanel', () => {
  it('shows quick picks and keeps refused targets visible with their reasons', () => {
    const onPick = vi.fn();
    render(<PlacementPickerPanel {...props({ onPick })} />);

    expect(screen.queryByRole('button', { name: /Put back/ })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Recent' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Open containers' })).toBeInTheDocument();

    const alreadyThere = screen.getByRole('button', { name: /Desk/ });
    expect(alreadyThere).toHaveAttribute('aria-disabled', 'true');
    expect(alreadyThere).toHaveAttribute('title', 'Already in Desk.');
    fireEvent.click(alreadyThere);
    expect(onPick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Small parts case/ }));
    expect(onPick).toHaveBeenCalledWith({ kind: 'container', containerId: 'box-parts' });
  });

  it('shows put-back and deleted-previous states', () => {
    const onPick = vi.fn();
    const { rerender } = render(
      <PlacementPickerPanel {...props({ subject: { kind: 'items', ids: ['itm-tape'] }, onPick })} />
    );

    const putBack = screen.getByRole('button', { name: /Put back to Red toolbox/ });
    fireEvent.click(putBack);
    expect(onPick).toHaveBeenCalledWith({ kind: 'location', locationId: 'loc-toolbox' });

    rerender(
      <PlacementPickerPanel
        {...props({ subject: { kind: 'items', ids: ['itm-headphones'] }, onPick })}
      />
    );
    expect(screen.getByText(/Previous place, Spare room, was deleted/)).toBeInTheDocument();
  });

  it('drills through breadcrumbs and picks a direct container', () => {
    const onPick = vi.fn();
    render(
      <PlacementPickerPanel
        {...props({
          subject: { kind: 'items', ids: ['itm-lamp'] },
          initialDrillId: 'loc-garage',
          onPick,
        })}
      />
    );

    expect(screen.getByRole('navigation', { name: 'Place path' })).toHaveTextContent(
      'All placesWattle Street houseGarage'
    );
    expect(screen.getByRole('button', { name: /Office 04/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show places in Workbench' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show places in Workbench' }));
    expect(screen.getByRole('navigation', { name: 'Place path' })).toHaveTextContent('Workbench');

    fireEvent.click(screen.getByRole('button', { name: 'All places' }));
    expect(screen.getByRole('navigation', { name: 'Place path' })).toHaveTextContent('All places');
  });

  it('ranks search results and creates an inline place', () => {
    const onPick = vi.fn();
    const onCreatePlace = vi.fn();
    render(
      <PlacementPickerPanel
        {...props({
          onPick,
          onCreatePlace,
          initialQuery: 'Linen press',
          initialDrillId: 'loc-hall',
        })}
      />
    );

    expect(
      screen.getByRole('button', { name: /New place “Linen press” in Hallway/ })
    ).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /New place “Linen press” in Hallway/ }));
    expect(onCreatePlace).toHaveBeenCalledWith('Linen press', 'loc-hall');

    fireEvent.change(screen.getByRole('textbox', { name: 'Search places and containers' }), {
      target: { value: 'she' },
    });
    expect(screen.getAllByRole('button', { name: /Shelving/ })[0]).toBeInTheDocument();
  });

  it('moves focus with arrow keys and lets Enter activate a row', () => {
    const onPick = vi.fn();
    render(
      <PlacementPickerPanel
        {...props({ onPick, initialDrillId: 'loc-garage', initialQuery: 'shelving' })}
      />
    );

    const search = screen.getByRole('textbox', { name: 'Search places and containers' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    const shelving = screen.getByRole('button', { name: /^Shelving/ });
    expect(shelving).toHaveFocus();

    fireEvent.click(shelving);
    expect(onPick).toHaveBeenCalledWith({ kind: 'location', locationId: 'loc-shelving' });
  });

  it('opens from a trigger through the popover wrapper', () => {
    render(
      <PlacementPicker
        {...props()}
        trigger={<button type="button">Choose place</button>}
        open={false}
      />
    );

    expect(screen.getByRole('button', { name: 'Choose place' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Choose a place' })).not.toBeInTheDocument();
  });
});
