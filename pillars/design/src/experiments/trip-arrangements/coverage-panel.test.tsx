import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ArrangementCoverage } from './coverage-panel';
import { createArrangementState } from './fixture';

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
  it('shows the exact missing nights without expanding neighbouring stays', () => {
    const state = coverageFixture();
    render(<ArrangementCoverage state={state} />);
    const panel = screen.getByRole('region', { name: 'Coverage issues' });
    expect(within(panel).getByText('Visit · 3 Jan — 5 Jan 2028')).toBeVisible();
    expect(within(panel).getByText('Visit → Next')).toBeVisible();
    expect(within(panel).getByRole('img', { name: 'Stays' })).toBeInTheDocument();
    expect(panel).not.toHaveTextContent('2028-01-03');
    expect(panel.querySelector('details, summary, .lucide-chevron-right')).toBeNull();
    expect(within(panel).queryByRole('button')).not.toBeInTheDocument();
    expect(within(panel).queryByText('Stay', { exact: true })).not.toBeInTheDocument();
  });

  it('does not expand unarranged flight records just to repeat their routes', () => {
    render(<ArrangementCoverage state={createArrangementState()} />);
    const panel = screen.getByRole('region', { name: 'Coverage issues' });
    expect(within(panel).getByText('Porto Alegre → Recife / Olinda')).toBeVisible();
    expect(within(panel).getByText('Florianópolis → Sydney')).toBeVisible();
    expect(panel.querySelector('details, summary, .lucide-chevron-right')).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Open POA → REC' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Open FLN → SYD' })).not.toBeInTheDocument();
  });
});
