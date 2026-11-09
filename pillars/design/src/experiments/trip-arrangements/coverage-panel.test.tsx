import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ArrangementCoverage } from './coverage-panel';
import { createArrangementState } from './fixture';
import { arrangementRows } from './model';

function coverageFixture() {
  const state = createArrangementState('empty');
  state.canvas.records = [
    {
      id: 'visit',
      title: 'Visit',
      kind: 'city',
      placeId: 'city',
      intention: 'In plan',
      arrangement: 'Not needed',
      notes: '',
      timing: { arrival: '2028-01-01', departure: '2028-01-05' },
    },
    {
      id: 'stay',
      title: 'Stay',
      kind: 'stay',
      placeId: 'city',
      visitId: 'visit',
      intention: 'In plan',
      arrangement: 'Booked',
      notes: '',
      schedule: { start: '2028-01-01', end: '2028-01-03' },
    },
    {
      id: 'next',
      title: 'Next',
      kind: 'city',
      placeId: 'next',
      intention: 'In plan',
      arrangement: 'Not needed',
      notes: '',
    },
  ];
  state.canvas.order = ['visit', 'next'];
  return state;
}

describe('coverage slot layout', () => {
  it('keeps the disclosure chevron inside a markerless row and formats typed lodging dates', () => {
    const state = coverageFixture();
    render(<ArrangementCoverage state={state} rows={arrangementRows(state)} />);
    const label = screen.getByText('Visit · 3 Jan — 5 Jan 2028');
    const summary = label.closest('summary');
    if (!summary) throw new Error('Expected expandable related stay source');
    expect(summary).toHaveClass('flex', 'list-none', 'marker:hidden');
    const chevron = summary.querySelector('.lucide-chevron-right');
    expect(chevron).toBeInTheDocument();
    expect(chevron?.parentElement).toHaveClass('flex', 'items-center');
    expect(summary).not.toHaveTextContent('2028-01-03');
    fireEvent.click(summary);
    expect(summary.parentElement).toHaveAttribute('open');
    expect(
      within(summary.parentElement ?? summary).getByRole('button', { name: 'Open Stay' })
    ).toBeVisible();
    expect(within(summary).getByRole('img', { name: 'Stays' })).toBeInTheDocument();
    const transport = screen.getByText('Visit → Next');
    const row = transport.closest('.flex.w-full');
    expect(row?.firstElementChild).toHaveClass('size-4', 'shrink-0');
    expect(row?.querySelector('.lucide-chevron-right')).toBeNull();
  });
});
