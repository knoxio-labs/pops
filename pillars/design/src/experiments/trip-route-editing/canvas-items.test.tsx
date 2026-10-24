import { fireEvent, render, screen } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { moveCard } from './canvas-actions';
import { CanvasContext, canvasDragType } from './canvas-context';
import { ActivityCard, CanvasItemGroup } from './canvas-items';
import { initialCanvas } from './canvas-model';
import { CanvasNode } from './canvas-node';

import type { TripRecord } from '@/fixtures/trip-overview-model';
import type { ReactNode } from 'react';

import type { CanvasActions } from './canvas-context';
import type { CanvasState } from './canvas-model';

vi.mock('./canvas-booking-times', () => ({
  BookingTimes: () => <span>Booking time editor</span>,
  BookingFindings: () => null,
}));
vi.mock('./canvas-transit', () => ({ TransitCard: () => <div>Transport</div> }));
vi.mock('./accommodation-view', () => ({
  AccommodationView: () => <div>Accommodation details</div>,
}));

const visit: TripRecord = {
  id: 'visit',
  kind: 'city',
  placeId: 'recife-olinda',
  intention: 'In plan',
  arrangement: 'Not needed',
  notes: '',
  timing: { arrival: '2028-01-01', departure: '2028-01-05' },
};
const early: TripRecord = {
  ...visit,
  id: 'early',
  kind: 'event',
  title: 'Early event',
  visitId: visit.id,
  timing: undefined,
  schedule: { start: '2028-01-02', localTime: '21:00' },
};
const late: TripRecord = {
  ...early,
  id: 'late',
  title: 'Later event',
  schedule: { start: '2028-01-04' },
};

function mount(
  content: ReactNode,
  overrides: Partial<CanvasState> = {},
  actions: Partial<CanvasActions> = {}
) {
  const changes = vi.fn<(next: CanvasState) => void>();
  const moves = vi.fn<CanvasActions['move']>();
  function Harness() {
    const [state, setState] = useState({
      ...initialCanvas('empty'),
      records: [visit, early, late],
      order: [visit.id],
      ...overrides,
    });
    const [hoverVisit, setHoverVisit] = useState<string | null>(null);
    const context = useMemo<CanvasActions>(
      () => ({
        state,
        preview: state,
        showDetails: false,
        dragged: null,
        hoverVisit,
        setHoverVisit,
        setDragged: vi.fn(),
        previewOrder: vi.fn(),
        add: vi.fn(),
        change: (next) => {
          changes(next);
          setState(next);
        },
        move: (id, target) => {
          moves(id, target);
          const next = moveCard(state, id, target);
          changes(next);
          setState(next);
        },
        ...actions,
      }),
      [state, hoverVisit]
    );
    return <CanvasContext.Provider value={context}>{content}</CanvasContext.Provider>;
  }
  return { ...render(<Harness />), changes, moves };
}

function transfer(id = early.id) {
  return {
    types: [canvasDragType],
    getData: () => id,
    setData: vi.fn(),
    setDragImage: vi.fn(),
    effectAllowed: '',
    dropEffect: '',
  };
}

function sortable(container: HTMLElement, id: string) {
  const element = container.querySelector(`[data-sortable-key="${id}"]`);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing sortable ${id}`);
  return element;
}

describe('Canvas activities', () => {
  it('renders root activities and accommodation as their own editable cards', () => {
    const stay: TripRecord = { ...early, id: 'stay', kind: 'stay', title: 'Root hotel' };
    mount(
      <>
        <CanvasNode record={early} />
        <CanvasNode record={stay} />
      </>
    );
    expect(screen.getByLabelText('Activity name')).toHaveValue(early.title);
    expect(screen.getByLabelText('Accommodation name')).toHaveValue('Root hotel');
    expect(screen.queryByLabelText('City / region')).toBeNull();
  });

  it('uses compact transparent activity fields and reserves the accent for purchased facts', () => {
    const { container, unmount } = mount(<ActivityCard item={early} />);
    const card = container.querySelector(`[data-canvas-id="${early.id}"]`);
    expect(card).toHaveClass('min-h-11');
    expect(card).not.toHaveClass('p-3', 'bg-card', 'border-l-app-accent');
    const input = screen.getByLabelText('Activity name');
    expect(input).toHaveClass('text-sm', 'font-medium');
    expect(input.parentElement).toHaveClass('bg-transparent', 'px-0');
    expect(screen.queryByText('Booking time editor')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit dates for Early event' }));
    expect(screen.getByText('Booking time editor')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Edit dates for Early event' })).toHaveClass(
      'text-muted-foreground'
    );
    unmount();
    const purchased = { ...early, purchase: 'Purchased' as const };
    const view = mount(<ActivityCard item={purchased} />);
    expect(view.container.querySelector(`[data-canvas-id="${early.id}"]`)).toHaveClass(
      'border-l-app-accent'
    );
  });

  it('edits an activity title without changing its location, dates or purchase facts', () => {
    const { changes } = mount(<ActivityCard item={early} />);
    fireEvent.blur(screen.getByLabelText('Activity name'), { target: { value: 'Changed title' } });
    expect(changes.mock.lastCall?.[0].records.find((record) => record.id === early.id)).toEqual({
      ...early,
      title: 'Changed title',
    });
  });

  it('edits schedule dates through TimingFields while preserving the local time', () => {
    const { changes } = mount(<ActivityCard item={early} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit dates for Early event' }));
    fireEvent.input(screen.getByLabelText('Arrival'), { target: { value: '2028-01-03' } });
    expect(
      changes.mock.lastCall?.[0].records.find((record) => record.id === early.id)?.schedule
    ).toEqual({ start: '2028-01-03', end: undefined, localTime: '21:00' });
  });

  it('marks dated child order red during hover, without committing until drop', () => {
    const { container, changes } = mount(
      <CanvasItemGroup visit={visit} items={[early, late]} containerId="activities" />
    );
    const dataTransfer = transfer();
    fireEvent.dragStart(sortable(container, early.id), { dataTransfer });
    fireEvent.dragOver(sortable(container, late.id), { dataTransfer });
    expect(container.querySelector(`[data-canvas-id="${late.id}"]`)).toHaveClass(
      'border-destructive'
    );
    expect(changes).not.toHaveBeenCalled();
    fireEvent.drop(sortable(container, late.id), { dataTransfer });
    expect(changes).toHaveBeenCalledOnce();
    expect(changes.mock.lastCall?.[0].itemOrders['activities']).toEqual([late.id, early.id]);
  });

  it('restores child date warnings when a preview is cancelled', () => {
    const { container, changes } = mount(
      <CanvasItemGroup visit={visit} items={[early, late]} containerId="activities" />
    );
    const dataTransfer = transfer();
    fireEvent.dragStart(sortable(container, early.id), { dataTransfer });
    fireEvent.dragOver(sortable(container, late.id), { dataTransfer });
    fireEvent.dragEnd(sortable(container, early.id), { dataTransfer });
    expect(container.querySelector(`[data-canvas-id="${late.id}"]`)).not.toHaveClass(
      'border-destructive'
    );
    expect(changes).not.toHaveBeenCalled();
  });

  it('moves a root card through the graph and retains its source facts and stay assignment', () => {
    const { container, moves, changes } = mount(
      <CanvasItemGroup
        visit={visit}
        items={[late]}
        containerId="activities"
        period={{ stayId: 'stay' }}
      />,
      {
        order: [early.id, visit.id],
        records: [
          visit,
          { ...early, visitId: undefined },
          late,
          {
            ...early,
            id: 'stay',
            kind: 'stay',
            schedule: { start: '2028-01-01', end: '2028-01-05' },
          },
        ],
      }
    );
    const target = container.firstElementChild;
    if (!target) throw new Error('Missing drop group');
    fireEvent.drop(target, { dataTransfer: transfer() });
    expect(moves).toHaveBeenCalledExactlyOnceWith(early.id, { visitId: visit.id, stayId: 'stay' });
    const next = changes.mock.lastCall?.[0];
    expect(next?.order).not.toContain(early.id);
    expect(next?.records.find((record) => record.id === early.id)?.schedule).toEqual(
      early.schedule
    );
    expect(next?.activityStays[early.id]).toBe('stay');
  });

  it('marks a hovered destination red when the activity dates or place conflict', () => {
    const foreign: TripRecord = {
      ...early,
      placeId: 'porto-alegre',
      schedule: { start: '2028-02-01' },
    };
    const { container } = mount(
      <CanvasNode record={visit} />,
      { records: [visit, foreign] },
      { dragged: foreign.id }
    );
    const city = container.querySelector(`[data-canvas-id="${visit.id}"]`);
    if (!city) throw new Error('Missing city');
    fireEvent.dragOver(city, { dataTransfer: transfer(foreign.id) });
    expect(city).toHaveClass('border-destructive');
    expect(screen.getByText('Outside visit dates')).toBeDefined();
    expect(screen.getByText('Different location')).toBeDefined();
  });

  it('shows uncovered nights at city scale and excludes a home place', () => {
    const { unmount } = mount(<CanvasNode record={visit} />);
    expect(screen.getByText('4 uncovered nights · 1 Jan → 5 Jan')).toBeDefined();
    unmount();
    mount(<CanvasNode record={visit} />, { homePlaces: [visit.placeId] });
    expect(screen.queryByText(/uncovered nights/)).toBeNull();
  });
});
