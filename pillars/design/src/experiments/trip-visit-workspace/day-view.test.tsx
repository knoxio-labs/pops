import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasContext } from '../trip-route-editing/canvas-context';
import { initialCanvas } from '../trip-route-editing/canvas-model';
import { useCanvasActions } from '../trip-route-editing/canvas-state';
import { VisitDays } from './day-view';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { CanvasState } from '../trip-route-editing/canvas-model';

const visit: TripRecord = {
  id: 'recife',
  kind: 'city',
  placeId: 'recife-olinda',
  intention: 'In plan',
  arrangement: 'Not needed',
  notes: '',
  timing: { arrival: '2028-01-01', departure: '2028-01-05' },
};

function mount(includeUndated = false, initial?: CanvasState) {
  const changes = vi.fn<(state: CanvasState) => void>();
  function Harness() {
    const [state, setState] = useState<CanvasState>(
      () =>
        initial ?? {
          ...initialCanvas('empty'),
          records: [
            visit,
            { ...visit, id: 'idea', kind: 'idea', visitId: visit.id, title: 'Unscheduled walk' },
          ],
          order: [visit.id],
        }
    );
    const actions = useCanvasActions(
      state,
      (next) => {
        changes(next);
        setState(next);
      },
      true
    );
    return (
      <CanvasContext.Provider value={actions}>
        <VisitDays visit={visit} day="2028-01-03" includeUndated={includeUndated} />
      </CanvasContext.Provider>
    );
  }
  return { ...render(<Harness />), changes };
}

describe('VisitDays', () => {
  it('keeps capture collapsed and adds an idea into this exact visit and day', () => {
    const { changes } = mount();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Unscheduled walk')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Add activity on/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Activity / idea' }), {
      target: { value: 'Museum visit' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(changes).toHaveBeenCalledOnce();
    expect(changes.mock.calls[0]?.[0].records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'idea',
          title: 'Museum visit',
          visitId: visit.id,
          schedule: { start: '2028-01-03' },
        }),
      ])
    );
    expect(screen.getByDisplayValue('Museum visit')).toBeInTheDocument();
  });

  it('includes undated items only when requested and edits their shared source title', () => {
    const { changes } = mount(true);
    const title = screen.getByDisplayValue('Unscheduled walk');
    fireEvent.change(title, { target: { value: 'Walk by the river' } });
    fireEvent.blur(title);
    const updated = changes.mock.calls[0]?.[0].records.find((record) => record.id === 'idea');
    expect(updated?.title).toBe('Walk by the river');
    expect(updated?.schedule).toBeUndefined();
  });

  it('shows each stay once on a hotel-switch day instead of repeating check-in as a night row', () => {
    mount(false, initialCanvas('default'));
    expect(
      screen.getAllByRole('button', { name: 'Edit accommodation Pousada do Largo' })
    ).toHaveLength(1);
    expect(
      screen.getAllByRole('button', { name: 'Edit accommodation Hotel da Praça' })
    ).toHaveLength(1);
    expect(screen.queryByText('Night')).not.toBeInTheDocument();
  });

  it('previews and saves visual row order without rewriting source commitments', () => {
    const initial = {
      ...initialCanvas('empty'),
      records: [
        visit,
        ...['early', 'late'].map((id): TripRecord => ({
          ...visit,
          id,
          kind: 'event',
          title: id,
          visitId: visit.id,
          purchase: 'Purchased',
          schedule: { start: '2028-01-03', localTime: id === 'early' ? '09:00' : '18:00' },
        })),
      ],
      order: [visit.id],
    };
    const { container, changes } = mount(false, initial);
    const first = container.querySelector('[data-sortable-key="early:start"]');
    const second = container.querySelector('[data-sortable-key="late:start"]');
    if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement))
      throw new Error('Expected sortable day rows');
    const dataTransfer = {
      setData: vi.fn(),
      setDragImage: vi.fn(),
      effectAllowed: '',
      dropEffect: '',
    };
    fireEvent.dragStart(first, { dataTransfer });
    fireEvent.dragOver(second, { dataTransfer });
    expect(screen.getAllByText('09:00 < 18:00')).toHaveLength(2);
    expect(changes).not.toHaveBeenCalled();
    fireEvent.drop(second, { dataTransfer });
    expect(changes.mock.calls[0]?.[0].itemOrders['visit-day:recife:2028-01-03']).toEqual([
      'late:start',
      'early:start',
    ]);
    expect(changes.mock.calls[0]?.[0].records).toEqual(initial.records);
  });
  it('lets a stay grip bubble to the complete sortable day row', () => {
    const { container } = mount(false, initialCanvas('default'));
    const stay = screen.getByRole('group', { name: 'Pousada do Largo' });
    const dataTransfer = {
      setData: vi.fn(),
      setDragImage: vi.fn(),
      effectAllowed: '',
      dropEffect: '',
    };
    expect(stay).toHaveAttribute('draggable', 'false');
    fireEvent.dragStart(stay, { dataTransfer });
    expect(dataTransfer.setDragImage).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-sortable-key="olinda-first:end"]')).toHaveAttribute(
      'data-sortable-placeholder',
      'true'
    );
    fireEvent.dragEnd(stay, { dataTransfer });
  });
});
