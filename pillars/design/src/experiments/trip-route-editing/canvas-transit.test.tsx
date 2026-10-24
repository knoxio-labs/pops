import { fireEvent, render, screen } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasContext } from './canvas-context';
import { initialCanvas } from './canvas-model';
import { RentalSections, TransitCard } from './canvas-transit';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { CanvasActions } from './canvas-context';
import type { CanvasState, RentalPeriod } from './canvas-model';

const visits: TripRecord[] = [
  {
    id: 'first',
    title: 'First city',
    kind: 'city',
    placeId: '',
    intention: 'In plan',
    arrangement: 'Not needed',
    notes: '',
  },
  {
    id: 'second',
    title: 'Second city',
    kind: 'city',
    placeId: '',
    intention: 'In plan',
    arrangement: 'Not needed',
    notes: '',
  },
];
const rental: RentalPeriod = {
  id: 'rental',
  provider: 'Local hire',
  from: '',
  to: '',
  start: '',
  end: '',
  status: 'Considering',
};

function mount(overrides: Partial<RentalPeriod> = {}, transport?: TripRecord) {
  const changes = vi.fn<(state: CanvasState) => void>();
  function Harness() {
    const [state, setState] = useState<CanvasState>({
      ...initialCanvas('empty'),
      records: [...visits, ...(transport ? [transport] : [])],
      order: transport ? ['first', transport.id, 'second'] : visits.map((visit) => visit.id),
      rentals: [{ ...rental, ...overrides }],
    });
    const context = useMemo<CanvasActions>(
      () => ({
        state,
        showDetails: true,
        preview: state,
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
    const journey = state.records.find((record) => record.id === transport?.id);
    return (
      <CanvasContext.Provider value={context}>
        {journey && <TransitCard record={journey} />}
        <RentalSections visitId="" />
        {state.order.map((id) => (
          <RentalSections key={id} visitId={id} />
        ))}
      </CanvasContext.Provider>
    );
  }
  render(<Harness />);
  return changes;
}

function choose(label: string, name: string): void {
  fireEvent.click(screen.getByRole('button', { name: label }));
  fireEvent.click(screen.getByRole('button', { name }));
  fireEvent.keyDown(document, { key: 'Escape' });
}

describe('rental route editing', () => {
  it('edits a captured transport name, dates and visit endpoints without changing purchased airport facts', () => {
    const transport: TripRecord = {
      ...visits[0],
      id: 'train',
      kind: 'transport',
      placeId: '',
      intention: 'In plan',
      arrangement: 'Booked',
      notes: '',
      purchase: 'Purchased',
      route: { fromId: 'airport-syd', toId: 'airport-gru' },
      title: 'Original train',
    };
    const changes = mount({}, transport);
    fireEvent.blur(screen.getByLabelText('Transport name'), { target: { value: 'Renamed train' } });
    fireEvent.input(screen.getByLabelText('Departure date'), { target: { value: '2028-01-01' } });
    fireEvent.input(screen.getByLabelText('Arrival date'), { target: { value: '2028-01-02' } });
    choose('Departure visit', 'First city');
    choose('Arrival visit', 'Second city');
    const latest = changes.mock.lastCall?.[0];
    expect(latest?.records.find((record) => record.id === transport.id)).toMatchObject({
      title: 'Renamed train',
      purchase: 'Purchased',
      arrangement: 'Booked',
      route: transport.route,
      schedule: { start: '2028-01-01', end: '2028-01-02' },
    });
    expect(latest?.transitLinks.train).toEqual({ from: 'first', to: 'second' });
  });

  it('keeps unknown pickups visible and edits both source visit endpoints and status', () => {
    const changes = mount();
    expect(screen.getByRole('region', { name: 'Car rental' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Car rental' }).className).toContain('border-dashed');
    fireEvent.blur(screen.getByLabelText('Rental provider'), { target: { value: 'Renamed hire' } });
    expect(changes.mock.lastCall?.[0].rentals[0]?.provider).toBe('Renamed hire');
    expect(screen.queryByRole('alert')).toBeNull();
    choose('Pickup visit', 'First city');
    expect(changes.mock.lastCall?.[0].rentals[0]).toMatchObject({
      from: 'first',
      to: '',
      start: '',
      end: '',
    });
    choose('Return visit', 'Second city');
    expect(changes.mock.lastCall?.[0].rentals[0]).toMatchObject({ from: 'first', to: 'second' });
    choose('Rental status', 'Reserved');
    expect(changes.mock.lastCall?.[0].rentals[0]?.status).toBe('Reserved');
    expect(screen.getByRole('region', { name: 'Car rental' }).className).toContain('border-dashed');
    choose('Rental status', 'Purchased');
    expect(screen.getByRole('region', { name: 'Car rental' }).className).toContain('border-solid');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not warn about blank endpoints but flags two known reversed visits', () => {
    mount({ from: 'second' });
    expect(screen.queryByRole('alert')).toBeNull();
    choose('Return visit', 'First city');
    expect(screen.getByRole('alert').textContent).toBe('Check rental visit order');
    choose('Return visit', 'Unset');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('writes exact calendar values and reports reversed pickup and return dates', () => {
    const changes = mount({ from: 'first', to: 'second' });
    fireEvent.input(screen.getByLabelText('Pickup'), { target: { value: '2028-01-05' } });
    fireEvent.input(screen.getByLabelText('Return'), { target: { value: '2028-01-03' } });
    expect(changes.mock.lastCall?.[0].rentals[0]).toMatchObject({
      start: '2028-01-05',
      end: '2028-01-03',
    });
    expect(screen.getByRole('alert').textContent).toBe('Pickup is after return');
    fireEvent.input(screen.getByLabelText('Return'), { target: { value: '2028-01-05' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
