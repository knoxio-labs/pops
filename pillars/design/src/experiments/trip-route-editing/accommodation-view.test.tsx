import { fireEvent, render, screen, within } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AccommodationStay } from './accommodation-stay';
import { AccommodationView } from './accommodation-view';
import { CanvasContext } from './canvas-context';
import { initialCanvas } from './canvas-model';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { CanvasActions } from './canvas-context';
import type { CanvasState } from './canvas-model';

vi.mock('./canvas-items', () => ({
  CanvasItemGroup: ({ items, containerId }: { items: TripRecord[]; containerId: string }) => (
    <div data-testid={containerId}>
      {items.map((item) => (
        <span key={item.id}>{item.title}</span>
      ))}
    </div>
  ),
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
const stay: TripRecord = {
  ...visit,
  id: 'stay',
  kind: 'stay',
  visitId: visit.id,
  title: 'First hotel',
  arrangement: 'Booked',
  schedule: { start: '2028-01-01', end: '2028-01-03' },
};

function mount(records: TripRecord[], overrides: Partial<CanvasState> = {}) {
  const changes = vi.fn<(state: CanvasState) => void>();
  const bubbledDrag = vi.fn();
  function Harness() {
    const [state, setState] = useState<CanvasState>({
      ...initialCanvas('empty'),
      records: [visit, ...records],
      ...overrides,
    });
    const context = useMemo<CanvasActions>(
      () => ({
        state,
        preview: state,
        showDetails: true,
        change: (next) => {
          changes(next);
          setState(next);
        },
        add: vi.fn(),
        move: vi.fn(),
        dragged: null,
        setDragged: vi.fn(),
        hoverVisit: null,
        setHoverVisit: vi.fn(),
        previewOrder: vi.fn(),
      }),
      [state]
    );
    return (
      <CanvasContext.Provider value={context}>
        <div onDragStart={bubbledDrag}>
          <AccommodationView visit={visit} />
        </div>
      </CanvasContext.Provider>
    );
  }
  return { ...render(<Harness />), changes, bubbledDrag };
}

function StaySource({ record, dragged = null }: { record: TripRecord; dragged?: string | null }) {
  const context = useMemo<CanvasActions>(() => {
    const state: CanvasState = { ...initialCanvas('empty'), records: [visit, record] };
    return {
      state,
      preview: state,
      showDetails: true,
      change: vi.fn(),
      add: vi.fn(),
      move: vi.fn(),
      dragged,
      setDragged: vi.fn(),
      hoverVisit: null,
      setHoverVisit: vi.fn(),
      previewOrder: vi.fn(),
    };
  }, [record, dragged]);
  return (
    <CanvasContext.Provider value={context}>
      <AccommodationStay stay={record} />
    </CanvasContext.Provider>
  );
}

describe('AccommodationView', () => {
  it('reflects source undo in dates and names and reserves hard styling for purchases', () => {
    const changed: TripRecord = {
      ...stay,
      title: 'Changed hotel',
      schedule: { start: '2028-01-02', end: '2028-01-04' },
      purchase: 'Purchased',
    };
    const view = render(<StaySource record={changed} />);
    expect(screen.getByRole('group', { name: 'Changed hotel' }).className).toContain(
      'border-solid'
    );
    expect(screen.getByLabelText('Check-in').getAttribute('value')).toBe('2028-01-02');
    view.rerender(<StaySource record={stay} />);
    expect(screen.getByLabelText('Accommodation name').getAttribute('value')).toBe('First hotel');
    expect(screen.getByLabelText('Check-in').getAttribute('value')).toBe('2028-01-01');
    expect(screen.getByLabelText('Check-out').getAttribute('value')).toBe('2028-01-03');
    expect(screen.getByRole('group', { name: 'First hotel' }).className).toContain('border-dashed');
    view.rerender(<StaySource record={changed} dragged={changed.id} />);
    const dragged = screen.getByRole('group', { name: 'Changed hotel' });
    expect(dragged.className).toContain('border-dashed');
    expect(dragged.querySelector('.invisible')).not.toBeNull();
  });

  it('retains home-place activities while hiding lodging status', () => {
    const activity: TripRecord = {
      ...visit,
      id: 'home-idea',
      title: 'Home idea',
      kind: 'idea',
      visitId: visit.id,
    };
    mount([stay, activity], { homePlaces: [visit.placeId] });
    expect(screen.getByText('Home idea')).toBeDefined();
    expect(screen.queryByText('Accommodation needed')).toBeNull();
    expect(screen.queryByLabelText('Accommodation name')).toBeNull();
  });

  it('retains a purchased activity outside the visit and flags its date conflict', () => {
    const activity: TripRecord = {
      ...visit,
      id: 'outside',
      title: 'Purchased concert',
      kind: 'event',
      visitId: visit.id,
      purchase: 'Purchased',
      schedule: { start: '2028-01-07' },
    };
    mount([activity]);
    expect(screen.getByText('Purchased concert')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toBe('Check visit dates');
  });

  it('returns activities to automatic periods when their assigned stay moves to another visit', () => {
    const activity: TripRecord = {
      ...visit,
      id: 'activity',
      title: 'Retained activity',
      kind: 'event',
      visitId: visit.id,
      schedule: { start: '2028-01-02' },
    };
    mount([{ ...stay, visitId: 'another-city' }, activity], {
      activityStays: { activity: stay.id },
    });
    expect(screen.getByText('Retained activity')).toBeDefined();
    expect(screen.queryByLabelText('Accommodation name')).toBeNull();
  });

  it('exposes a whole draggable stay without bubbling into the parent city', () => {
    const { bubbledDrag } = mount([stay]);
    const card = screen.getByRole('group', { name: 'First hotel' });
    expect(card.getAttribute('data-canvas-id')).toBe(stay.id);
    expect(card.getAttribute('draggable')).toBe('true');
    fireEvent.dragStart(card);
    expect(bubbledDrag).not.toHaveBeenCalled();
  });

  it('updates arrangement and purchase only through explicit source controls', () => {
    const { changes } = mount([{ ...stay, arrangement: 'Not arranged' }]);
    expect(screen.getAllByText('Accommodation needed')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Accommodation arrangement' }));
    fireEvent.click(screen.getByRole('button', { name: 'Booked' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      changes.mock.lastCall?.[0].records.find((item) => item.id === stay.id)?.arrangement
    ).toBe('Booked');
    expect(
      changes.mock.lastCall?.[0].records.find((item) => item.id === stay.id)?.purchase
    ).toBeUndefined();
    expect(screen.getAllByText('Accommodation needed')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Purchased' }));
    expect(changes.mock.lastCall?.[0].records.find((item) => item.id === stay.id)?.purchase).toBe(
      'Purchased'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Purchased' }));
    expect(
      changes.mock.lastCall?.[0].records.find((item) => item.id === stay.id)?.purchase
    ).toBeUndefined();
  });

  it('hides accommodation for a home place', () => {
    const { container } = mount([stay], { homePlaces: [visit.placeId] });
    expect(container.textContent).toBe('');
  });

  it('keeps two same-city stays distinct and exposes an actionable gap', () => {
    const second: TripRecord = {
      ...stay,
      id: 'second',
      title: 'Second hotel',
      schedule: { start: '2028-01-04', end: '2028-01-05' },
    };
    mount([stay, second]);
    expect(
      screen.getAllByLabelText('Accommodation name').map((input) => input.getAttribute('value'))
    ).toEqual(['First hotel', 'Second hotel']);
    expect(screen.getByText('Accommodation needed')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add accommodation' })).toBeDefined();
    expect(screen.getByText('3 Jan → 4 Jan')).toBeDefined();
  });

  it('writes source title and dates and shows invalid chronology', () => {
    const { changes } = mount([stay]);
    fireEvent.blur(screen.getByLabelText('Accommodation name'), {
      target: { value: 'Renamed hotel' },
    });
    expect(changes.mock.lastCall?.[0].records.find((item) => item.id === stay.id)?.title).toBe(
      'Renamed hotel'
    );
    fireEvent.input(screen.getByLabelText('Check-out'), { target: { value: '2027-12-31' } });
    expect(
      changes.mock.lastCall?.[0].records.find((item) => item.id === stay.id)?.schedule
    ).toEqual({ start: '2028-01-01', end: '2027-12-31' });
    expect(screen.getByRole('alert').textContent).toBe('Check accommodation dates');
  });

  it('keeps manually assigned activities under their stay even outside its dates', () => {
    const activity: TripRecord = {
      ...visit,
      id: 'activity',
      kind: 'event',
      title: 'Late dinner',
      visitId: visit.id,
      schedule: { start: '2028-01-04' },
    };
    const transport: TripRecord = {
      ...activity,
      id: 'transport',
      kind: 'transport',
      title: 'Flight',
    };
    mount([stay, activity, transport], {
      activityStays: { activity: stay.id, transport: stay.id },
    });
    expect(
      within(screen.getByTestId('period:visit:2028-01-01:2028-01-03')).getByText('Late dinner')
    ).toBeDefined();
    expect(
      within(screen.getByTestId('period:visit:2028-01-03:2028-01-05')).queryByText('Late dinner')
    ).toBeNull();
    expect(screen.queryByText('Flight')).toBeNull();
  });
});

describe('accommodation visit conflicts', () => {
  it('keeps partially intersecting stays visible and flags their wrong date and location', () => {
    mount([{ ...stay, placeId: 'curitiba', schedule: { start: '2027-12-31', end: '2028-01-03' } }]);
    expect(screen.getByDisplayValue('First hotel')).toBeDefined();
    expect(screen.getByText('Accommodation outside visit dates')).toBeDefined();
    expect(screen.getByText('Accommodation in a different location')).toBeDefined();
  });
});
