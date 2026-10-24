import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DirectPlanner } from './direct';
import { assignItem, initialPlanner, reorderRoute, removeVisit } from './model';

function transfer() {
  const values = new Map<string, string>();
  return {
    effectAllowed: 'move',
    dropEffect: 'move',
    get types() {
      return [...values.keys()];
    },
    setData: (type: string, value: string) => values.set(type, value),
    getData: (type: string) => values.get(type) ?? '',
  };
}

describe('direct route editing', () => {
  it('drags visits and restores the previous order with undo', () => {
    render(<DirectPlanner />);
    const dataTransfer = transfer();
    fireEvent.dragStart(
      within(screen.getAllByRole('article', { name: 'Sydney' })[0]!).getByRole('img', {
        name: 'Drag visit 1',
      }),
      { dataTransfer }
    );
    fireEvent.dragOver(screen.getByRole('article', { name: 'São Paulo' }), {
      dataTransfer,
    });
    fireEvent.drop(screen.getByRole('article', { name: 'São Paulo' }), {
      dataTransfer,
    });
    expect(screen.getAllByRole('article')[0]?.getAttribute('aria-label')).toBe('São Paulo');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getAllByRole('article')[0]?.getAttribute('aria-label')).toBe('Sydney');
  });
  it('moves events between visits while keeping the route order and original facts', () => {
    render(<DirectPlanner />);
    const dataTransfer = transfer();
    const source = screen.getByLabelText('Drag Birthday').closest('[data-sortable-key]');
    if (!source) throw new Error('Missing sortable activity');
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.drop(screen.getByRole('article', { name: 'Porto Alegre' }), {
      dataTransfer,
    });
    expect(
      within(screen.getAllByRole('article', { name: 'Curitiba' })[0]!).queryByDisplayValue(
        'Birthday'
      )
    ).toBeNull();
    const destination = within(screen.getByRole('article', { name: 'Porto Alegre' }));
    expect(destination.getByDisplayValue('Birthday')).toBeDefined();
    expect(destination.getByText('16 Dec')).toBeDefined();
    expect(destination.getByText('Different location')).toBeDefined();
    expect(screen.getAllByRole('article')[0]?.getAttribute('aria-label')).toBe('Sydney');
  });
  it('applies date edits immediately and restores them with undo', () => {
    render(<DirectPlanner />);
    const visit = within(screen.getAllByRole('article', { name: 'Curitiba' })[0]!);
    fireEvent.click(visit.getByRole('button', { name: 'Edit timing' }));
    fireEvent.input(screen.getByLabelText('Arrival'), { target: { value: '2027-12-14' } });
    expect(visit.getByRole('button', { name: 'Edit timing' }).textContent).toContain('14 Dec');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(visit.getByRole('button', { name: 'Edit timing' }).textContent).toContain('Add dates');
  });
  it('creates a freely named city at the chosen position', () => {
    render(<DirectPlanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Insert after stop 2' }));
    fireEvent.change(screen.getByPlaceholderText('Name'), {
      target: { value: 'Vitória' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    expect(screen.getAllByRole('article')[1]?.getAttribute('aria-label')).toBe('Vitória');
    expect(screen.queryByRole('button', { name: 'Save visit' })).toBeNull();
  });
  it('shows arranged hotel periods and uncovered nights without nesting flights in visits', () => {
    render(<DirectPlanner />);
    const recife = within(screen.getByRole('article', { name: 'Recife / Olinda' }));
    expect(recife.getByText('5 Jan → 6 Jan')).toBeDefined();
    expect(recife.getByText('Accommodation needed')).toBeDefined();
    expect(recife.queryByText('POA → REC')).toBeNull();
    expect(screen.getByLabelText('Pickup')).toBeDefined();
  });
  it('opens the days around the outbound flight without changing the route', () => {
    render(<DirectPlanner />);
    fireEvent.click(screen.getByRole('button', { name: 'SYD → DFW · DFW → GRU ±1 day' }));
    expect(screen.getByRole('button', { name: 'Hours' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('From').getAttribute('value')).toBe('2027-11-23');
    expect(screen.getByLabelText('To').getAttribute('value')).toBe('2027-11-26');
    expect(screen.getAllByText(/45 min available/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Bookings' }));
    expect(screen.getByRole('article', { name: 'São Paulo' })).toBeDefined();
  });
  it('can capture the first arbitrary item in an empty route', () => {
    render(<DirectPlanner scenario="empty" />);
    fireEvent.click(screen.getByRole('button', { name: 'Insert at start' }));
    fireEvent.click(screen.getByRole('button', { name: 'Activity / idea' }));
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Meet Alex' } });
    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    expect(screen.getByLabelText('Drag Meet Alex')).toBeDefined();
  });
});

describe('direct route state boundaries', () => {
  it('rejects incomplete, duplicated and foreign drag orders', () => {
    const state = initialPlanner('default');
    expect(reorderRoute(state, state.order.slice(1))).toBe(state);
    expect(
      reorderRoute(
        state,
        state.order.map(() => 'recife')
      )
    ).toBe(state);
    expect(reorderRoute(state, ['missing', ...state.order.slice(1)])).toBe(state);
  });
  it('retains paid arrangement facts when moved, and rejects invalid targets', () => {
    const state = initialPlanner('default');
    const paid = state.records.find((r) => r.id === 'hotel');
    expect(paid).toBeDefined();
    const next = assignItem(state, 'hotel', 'curitiba');
    expect(next.records.find((r) => r.id === 'hotel')).toEqual({ ...paid, visitId: 'curitiba' });
    expect(assignItem(state, 'hotel', 'open-january')).toBe(state);
    expect(assignItem(state, 'curitiba', 'recife')).toBe(state);
    expect(assignItem(state, 'missing', 'recife')).toBe(state);
  });
  it('removes only route membership so linked purchases survive undo', () => {
    const state = initialPlanner('default');
    const next = removeVisit(state, 'recife');
    expect(next.order).not.toContain('recife');
    expect(next.records.filter((r) => r.purchase)).toEqual(state.records.filter((r) => r.purchase));
    expect(next.records.find((r) => r.id === 'recife')).toBeDefined();
  });
});
