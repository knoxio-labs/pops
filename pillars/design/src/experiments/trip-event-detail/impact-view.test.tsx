import { fireEvent, render, screen } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { moveCard } from '../trip-route-editing/canvas-actions';
import { CanvasContext } from '../trip-route-editing/canvas-context';
import { initialCanvas } from '../trip-route-editing/canvas-model';
import { EventRouteImpact } from './impact-view';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { CanvasActions } from '../trip-route-editing/canvas-context';
import type { CanvasState } from '../trip-route-editing/canvas-model';

const visit: TripRecord = {
  id: 'visit',
  title: 'Event city',
  kind: 'city',
  placeId: 'event-place',
  intention: 'Considering',
  arrangement: 'Not needed',
  notes: '',
};
const event: TripRecord = {
  ...visit,
  id: 'event',
  kind: 'event',
  visitId: visit.id,
  purchase: 'Purchased',
  schedule: { start: '2028-01-22', end: '2028-01-24', localTime: '20:00' },
};

function mount() {
  const changes = vi.fn<(state: CanvasState) => void>();
  function Harness() {
    const [state, setState] = useState<CanvasState>({
      ...initialCanvas('empty'),
      records: [
        visit,
        event,
        { ...visit, id: 'other', placeId: 'other-place', title: 'Other city' },
        { ...visit, id: 'gap', kind: 'gap', title: 'Open segment' },
      ],
      order: ['other', 'gap'],
      sections: [{ id: 'section', gapId: 'gap', title: 'Options', cards: [visit.id] }],
    });
    const canvas = useMemo<CanvasActions>(() => {
      function change(next: CanvasState) {
        changes(next);
        setState(next);
      }
      return {
        state,
        preview: state,
        change,
        showDetails: true,
        move: (id, target) => change(moveCard(state, id, target)),
        add: vi.fn(),
        dragged: null,
        setDragged: vi.fn(),
        hoverVisit: null,
        setHoverVisit: vi.fn(),
        previewOrder: vi.fn(),
      };
    }, [state]);
    const current = state.records.find((record) => record.id === event.id);
    return (
      <CanvasContext.Provider value={canvas}>
        {current && <EventRouteImpact event={current} />}
      </CanvasContext.Provider>
    );
  }
  render(<Harness />);
  return changes;
}

describe('EventRouteImpact', () => {
  it('requires an insertion choice and commits only the selected city at that anchor', () => {
    const changes = mount();
    expect(screen.queryByLabelText('Associated city visit')).not.toBeInTheDocument();
    expect(screen.getAllByText('Event city')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Add city to route' })).toBeDisabled();
    expect(changes).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Insert city'), { target: { value: 'after:other' } });
    expect(changes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Add city to route' }));
    const next = changes.mock.calls[0]?.[0];
    expect(next?.order).toEqual(['other', visit.id, 'gap']);
    expect(next?.records.find((record) => record.id === event.id)).toEqual(event);
    expect(next?.sections[0]?.cards).toEqual([]);
    expect(screen.getByRole('button', { name: 'Add arrival transport' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add city to route' })).not.toBeInTheDocument();
  });

  it('moves event membership without rewriting purchased dates or source location', () => {
    const changes = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Choose associated visit' }));
    fireEvent.change(screen.getByLabelText('Associated city visit'), {
      target: { value: 'other' },
    });
    const next = changes.mock.calls[0]?.[0];
    expect(next?.records.find((record) => record.id === event.id)).toEqual({
      ...event,
      visitId: 'other',
    });
    expect(next?.order).toEqual(['other', 'gap']);
    expect(
      screen.getByText('Event location differs from the associated city.')
    ).toBeInTheDocument();
  });

  it('keeps an alternative selectable without adding it to the route', () => {
    const changes = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Choose associated visit' }));
    fireEvent.change(screen.getByLabelText('Associated city visit'), {
      target: { value: 'other' },
    });
    fireEvent.change(screen.getByLabelText('Associated city visit'), {
      target: { value: visit.id },
    });
    const next = changes.mock.calls.at(-1)?.[0];
    expect(next?.records.find((record) => record.id === event.id)?.visitId).toBe(visit.id);
    expect(next?.order).toEqual(['other', 'gap']);
    expect(screen.getByRole('button', { name: 'Add city to route' })).toBeDisabled();
  });
});
