import { DndContext } from '@dnd-kit/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../model/placement-model.js';
import { at, box, inBox, item } from '../test-fixtures/core-factory.js';
import { ContentsSelectionBar } from './contents-bar.js';
import { BoxedList, HereList, PlacesList } from './contents-lists.js';
import { PlaceOverlays } from './place-overlays.js';

import type { ReactElement } from 'react';

import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';
import type { LocationModel, StoreHereTarget } from '../model/contracts.js';
import type { PlacementWorld } from '../model/placement-model.js';
import type { SelectionApi } from '../selection/use-selection.js';
import type { RowContext } from './contents-rows.js';
import type { ContentsVerbs } from './use-contents-verbs.js';

vi.mock('../store-here/store-here-sheet.js', () => ({
  StoreHereSheet: ({ target }: { target: StoreHereTarget }): ReactElement => (
    <output data-testid="store-target">{`${target.kind}:${target.id}:${target.name}`}</output>
  ),
}));
vi.mock('./move-items-anchor.js', () => ({
  MoveItemsAnchor: (): ReactElement => <output data-testid="move-anchor" />,
}));

function renderDnd(element: ReactElement) {
  return render(<DndContext>{element}</DndContext>);
}

function rowContext(world: PlacementWorld, overrides: Partial<RowContext> = {}): RowContext {
  return {
    world,
    pendingIds: new Set(),
    rejections: {},
    ...overrides,
  };
}

function selection(ids: readonly string[]): SelectionApi {
  return {
    state: { selected: new Set(ids), anchorId: ids[0] ?? null, focusedId: ids[0] ?? null },
    count: ids.length,
    coverage: 'all',
    selectedIds: [...ids],
    isSelected: (id) => ids.includes(id),
    onRowToggle: vi.fn(),
    onHeaderToggle: vi.fn(),
    clearSelection: vi.fn(),
    onKey: vi.fn(() => false),
  };
}

function verbs(overrides: Partial<ContentsVerbs> = {}): ContentsVerbs {
  return {
    moving: null,
    startMove: vi.fn(),
    cancelMove: vi.fn(),
    moveIds: vi.fn(),
    moveTo: vi.fn(),
    pickUp: vi.fn(),
    takeOut: vi.fn(),
    label: vi.fn(),
    lifecycle: null,
    startLifecycle: vi.fn(),
    cancelLifecycle: vi.fn(),
    confirmLifecycle: vi.fn(),
    rejections: {},
    pendingIds: new Set(),
    keyHandlersFor: vi.fn(() => ({})),
    ...overrides,
  };
}

function zeroTally(): PlaceTally {
  return { boxesHere: 0, inBoxes: 0, itemsHere: 0, places: 0, total: 0 };
}

describe('place contents surfaces', () => {
  it('HereList opens a row and BoxedList indents nested boxes', () => {
    const locations = [{ id: 'garage', name: 'Garage', parentId: null, kind: 'property' as const }];
    const outer = box(['outer', 'Outer', 'box-type'], at('garage'), 'open');
    const inner = box(['inner', 'Inner', 'box-type'], inBox('outer'), 'open');
    const lamp = item(['lamp', 'Lamp', null], at('garage'));
    const deep = item(['deep', 'Deep', null], inBox('inner'));
    const world = buildWorld([outer, inner, lamp, deep], locations);
    const onOpenItem = vi.fn();

    renderDnd(
      <>
        <HereList items={[outer, lamp]} ctx={rowContext(world, { onOpenItem })} />
        <BoxedList
          groups={[
            { box: outer, depth: 0, contents: [inner] },
            { box: inner, depth: 1, contents: [deep] },
          ]}
          ctx={rowContext(world, { onOpenItem })}
        />
      </>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Lamp' }));
    expect(onOpenItem).toHaveBeenCalledWith('lamp');
    expect(screen.getByRole('rowgroup', { name: 'Inner' }).querySelector('.pl-12')).not.toBeNull();
  });

  it('PlacesList reads each place detail from its tally', () => {
    const places: LocationModel[] = [
      { id: 'shelf', name: 'Shelf', parentId: 'garage', kind: 'storage' },
      { id: 'desk', name: 'Desk', parentId: 'garage', kind: 'furniture' },
    ];
    const tallies = new Map<string, PlaceTally>([
      ['shelf', { ...zeroTally(), places: 2, total: 3 }],
      ['desk', zeroTally()],
    ]);
    const world = buildWorld(
      [],
      [{ id: 'garage', name: 'Garage', parentId: null, kind: 'property' }, ...places]
    );

    renderDnd(
      <PlacesList
        places={places}
        ctx={rowContext(world)}
        tallyOf={(id) => tallies.get(id) ?? zeroTally()}
        onOpenPlace={vi.fn()}
      />
    );

    expect(screen.getByText('2 places, 3 things')).toBeInTheDocument();
    expect(screen.getByText('Empty')).toBeInTheDocument();
  });

  it('disables Take out unless every selected thing is inside a box', () => {
    const locations = [{ id: 'garage', name: 'Garage', parentId: null, kind: 'property' as const }];
    const loose = item(['loose', 'Loose', null], at('garage'));
    const boxed = item(['boxed', 'Boxed', null], inBox('box'));
    const container = box(['box', 'Box', 'box-type'], at('garage'), 'open');
    const world = buildWorld([loose, boxed, container], locations);

    render(
      <ContentsSelectionBar
        world={world}
        selection={selection(['loose', 'boxed'])}
        verbs={verbs()}
      />
    );

    expect(screen.getByRole('button', { name: /^Take out/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('disables Print labels above MAX_LABEL_IDS with the reason', () => {
    const locations = [{ id: 'garage', name: 'Garage', parentId: null, kind: 'property' as const }];
    const rows = Array.from({ length: 201 }, (_, index) =>
      item([`item-${index}`, `Item ${index}`, null], at('garage'))
    );
    const ids = rows.map(({ id }) => id);
    const world = buildWorld(rows, locations);

    render(<ContentsSelectionBar world={world} selection={selection(ids)} verbs={verbs()} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions for the selection' }), {
      button: 0,
      pointerType: 'mouse',
    });

    expect(screen.getByRole('menuitem', { name: 'Print labels' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('PlaceOverlays opens Store here with the place as a location target', () => {
    const place: LocationModel = {
      id: 'garage',
      name: 'Garage',
      parentId: null,
      kind: 'property',
    };

    render(
      <PlaceOverlays
        verbs={verbs()}
        world={buildWorld([], [place])}
        place={place}
        storing
        onStoringChange={vi.fn()}
      />
    );

    expect(screen.getByTestId('store-target')).toHaveTextContent('location:garage:Garage');
  });

  it('offline disables every row verb with the offline reason', () => {
    const row = item(['lamp', 'Lamp', null], at('garage'));
    const world = buildWorld(
      [row],
      [{ id: 'garage', name: 'Garage', parentId: null, kind: 'property' }]
    );

    renderDnd(
      <HereList items={[row]} ctx={rowContext(world, { disabledReason: 'No connection' })} />
    );

    expect(screen.getByRole('button', { name: 'Pick up' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Move' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows the accent edge for pending rows and Not saved for refused rows', () => {
    const row = item(['lamp', 'Lamp', null], at('garage'));
    const world = buildWorld(
      [row],
      [{ id: 'garage', name: 'Garage', parentId: null, kind: 'property' }]
    );

    renderDnd(
      <HereList
        items={[row]}
        ctx={rowContext(world, {
          pendingIds: new Set(['lamp']),
          rejections: { lamp: 'The place is closed.' },
        })}
      />
    );

    expect(screen.getByRole('row')).toHaveClass('border-l-app-accent');
    expect(screen.getByRole('alert')).toHaveTextContent('Not saved. The place is closed.');
  });
});
