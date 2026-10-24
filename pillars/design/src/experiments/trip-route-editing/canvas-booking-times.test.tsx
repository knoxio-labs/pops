import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BookingTimes } from './canvas-booking-times';
import { CanvasContext } from './canvas-context';
import { initialCanvas } from './canvas-model';

import type { CanvasActions } from './canvas-context';
import type { CanvasState } from './canvas-model';

function Harness({ actions, recordId }: { actions: CanvasActions; recordId: string }) {
  return (
    <CanvasContext.Provider value={actions}>
      <BookingTimes recordId={recordId} />
    </CanvasContext.Provider>
  );
}

function renderTimes(recordId = 'flight') {
  const state = initialCanvas('default');
  const change = vi.fn<(next: CanvasState) => void>();
  const actions: CanvasActions = {
    state,
    preview: state,
    change,
    showDetails: true,
    add: vi.fn(),
    move: vi.fn(),
    dragged: null,
    setDragged: vi.fn(),
    hoverVisit: null,
    setHoverVisit: vi.fn(),
    previewOrder: vi.fn(),
  };
  render(<Harness actions={actions} recordId={recordId} />);
  return { change, state };
}

describe('booking wall-clock editor', () => {
  it('writes the edited Sydney local clock using the new date DST offset', () => {
    const { change } = renderTimes();
    fireEvent.input(screen.getByLabelText('Start · Australia/Sydney'), {
      target: { value: '2028-06-15T10:00' },
    });
    expect(change).toHaveBeenCalledWith(
      expect.objectContaining({
        clockOverrides: { 'outbound-syd-dfw': { startAt: '2028-06-15T10:00:00+10:00' } },
      })
    );
  });

  it('retains invalid DST gap input with an error and does not write an invented instant', () => {
    const { change } = renderTimes();
    const input = screen.getByLabelText('Start · America/Chicago');
    fireEvent.input(input, { target: { value: '2028-03-12T02:30' } });
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByText('Invalid or ambiguous local time · America/Chicago')).toBeTruthy();
    expect(input).toHaveValue('2028-03-12T02:30');
  });
});

describe('booking source synchronization', () => {
  it('updates first departure source dates and local clock atomically with the precise override', () => {
    const { state, change } = renderTimes();
    const original = state.records.find((record) => record.id === 'flight');
    fireEvent.input(screen.getByLabelText('Start · Australia/Sydney'), {
      target: { value: '2028-06-15T10:30' },
    });
    const next = change.mock.calls[0]?.[0];
    if (!next) throw new Error('Missing edited state');
    expect(next.records.find((record) => record.id === 'flight')).toEqual({
      ...original,
      schedule: { ...original?.schedule, start: '2028-06-15', localTime: '10:30' },
    });
    expect(next.clockOverrides['outbound-syd-dfw']?.startAt).toBe('2028-06-15T10:30:00+10:00');
    expect(original?.schedule?.start).toBe('2027-11-24');
  });

  it('keeps internal connection edits independent from parent route dates', () => {
    const { state, change } = renderTimes();
    fireEvent.input(screen.getByLabelText('Start · America/Chicago'), {
      target: { value: '2027-11-24T10:00' },
    });
    const next = change.mock.calls[0]?.[0];
    if (!next) throw new Error('Missing edited state');
    expect(next.records).toBe(state.records);
    expect(next.clockOverrides['outbound-dfw-gru']?.startAt).toBe('2027-11-24T10:00:00-06:00');
  });

  it('updates the final leg arrival source date while retaining departure and purchase facts', () => {
    const { state, change } = renderTimes();
    const original = state.records.find((record) => record.id === 'flight');
    fireEvent.input(screen.getByLabelText('End · America/Sao_Paulo'), {
      target: { value: '2027-11-26T01:00' },
    });
    const next = change.mock.calls[0]?.[0];
    if (!next) throw new Error('Missing edited state');
    expect(next.records.find((record) => record.id === 'flight')).toEqual({
      ...original,
      schedule: { ...original?.schedule, start: '2027-11-24', end: '2027-11-26' },
    });
    expect(next.clockOverrides['outbound-dfw-gru']?.endAt).toBe('2027-11-26T01:00:00-03:00');
  });

  it('uses the existing precise departure when setting an end date on an otherwise undated source', () => {
    const { state, change } = renderTimes('return-flight');
    expect(state.records.find((record) => record.id === 'return-flight')?.schedule).toBeUndefined();
    fireEvent.input(screen.getByLabelText('End · Australia/Sydney'), {
      target: { value: '2028-02-28T07:00' },
    });
    const next = change.mock.calls[0]?.[0];
    expect(next?.records.find((record) => record.id === 'return-flight')?.schedule).toEqual({
      start: '2028-02-25',
      end: '2028-02-28',
    });
  });

  it('updates event start dates and localTime without changing purchase or location facts', () => {
    const { state, change } = renderTimes('ticket');
    const original = state.records.find((record) => record.id === 'ticket');
    fireEvent.input(screen.getByLabelText('Start · America/Recife'), {
      target: { value: '2028-01-03T21:30' },
    });
    const next = change.mock.calls[0]?.[0];
    expect(next?.records.find((record) => record.id === 'ticket')).toEqual({
      ...original,
      schedule: { ...original?.schedule, start: '2028-01-03', localTime: '21:30' },
    });
  });
});
