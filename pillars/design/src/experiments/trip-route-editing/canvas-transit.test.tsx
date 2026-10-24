import { fireEvent, render, screen } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasContext } from './canvas-context';
import { initialCanvas } from './canvas-model';
import { RentalSections } from './canvas-rentals';
import { TransitCard } from './canvas-transit';

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

function openRental(): void {
  if (!screen.queryByLabelText('Pickup'))
    fireEvent.click(screen.getByRole('button', { name: 'Edit rental' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Edit transport' }));
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
    const pickup = screen.getByRole('region', { name: 'Car rental' });
    expect(pickup.className).toContain('border-dashed');
    expect(pickup.className).not.toContain('mx-6');
    expect(screen.queryByLabelText('Pickup')).toBeNull();
    fireEvent.blur(screen.getByLabelText('Rental provider'), { target: { value: 'Renamed hire' } });
    expect(changes.mock.lastCall?.[0].rentals[0]?.provider).toBe('Renamed hire');
    expect(screen.getByText('Set pickup visit')).toBeDefined();
    openRental();
    choose('Pickup visit', 'First city');
    expect(changes.mock.lastCall?.[0].rentals[0]).toMatchObject({
      from: 'first',
      to: '',
      start: '',
      end: '',
    });
    openRental();
    choose('Return visit', 'Second city');
    expect(changes.mock.lastCall?.[0].rentals[0]).toMatchObject({ from: 'first', to: 'second' });
    openRental();
    fireEvent.click(screen.getByRole('button', { name: 'Reserved' }));
    expect(changes.mock.lastCall?.[0].rentals[0]?.status).toBe('Reserved');
    expect(screen.getByRole('region', { name: 'Car rental' }).className).toContain('border-dashed');
    fireEvent.click(screen.getByRole('button', { name: 'Purchased' }));
    expect(screen.getByRole('region', { name: 'Car rental' }).className).toContain('border-solid');
    expect(screen.getAllByRole('region', { name: 'Car rental' })).toHaveLength(1);
    expect(screen.getByRole('note', { name: 'Car rental return' }).textContent).toContain(
      'Renamed hire'
    );
  });

  it('does not warn about blank endpoints but flags two known reversed visits', () => {
    mount({ from: 'second' });
    expect(screen.queryByText('Check rental visit order')).toBeNull();
    openRental();
    choose('Return visit', 'First city');
    expect(screen.getByText('Check rental visit order')).toBeDefined();
    openRental();
    choose('Return visit', 'Unset');
    expect(screen.queryByText('Check rental visit order')).toBeNull();
  });

  it('writes exact calendar values and reports reversed pickup and return dates', () => {
    const changes = mount({ from: 'first', to: 'second' });
    openRental();
    fireEvent.input(screen.getByLabelText('Pickup'), { target: { value: '2028-01-05' } });
    fireEvent.input(screen.getByLabelText('Return'), { target: { value: '2028-01-03' } });
    expect(changes.mock.lastCall?.[0].rentals[0]).toMatchObject({
      start: '2028-01-05',
      end: '2028-01-03',
    });
    expect(screen.getByText('Pickup is after return')).toBeDefined();
    expect(screen.getByRole('note', { name: 'Car rental return' }).textContent).toContain('3 Jan');
    fireEvent.input(screen.getByLabelText('Return'), { target: { value: '2028-01-05' } });
    expect(screen.queryByText('Pickup is after return')).toBeNull();
  });

  it('retains malformed source dates for correction and never duplicates the return form', () => {
    mount({ from: 'first', to: 'second', start: 'invalid-date', end: '2028-01-05' });
    expect(screen.getByText('Check rental dates')).toBeDefined();
    expect(screen.getByRole('note', { name: 'Car rental return' }).textContent).toContain('5 Jan');
    expect(screen.getAllByRole('button', { name: 'Edit rental' })).toHaveLength(1);
    expect(screen.getAllByLabelText('Rental provider')).toHaveLength(1);
  });
});
