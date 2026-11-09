import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TripCalendarWorkspace } from './workspace';

function selectKind(label: string) {
  fireEvent.click(screen.getByRole('combobox', { name: 'Kind' }));
  fireEvent.click(screen.getByRole('option', { name: label }));
}

function selectFlight(label: RegExp) {
  fireEvent.click(screen.getByRole('combobox', { name: 'Flight journey' }));
  fireEvent.click(screen.getByRole('option', { name: label }));
}

describe('trip calendar projections', () => {
  it.each(['agenda', 'timeline'] as const)(
    'filters bookings separately from inclusive floating availability in %s',
    (layout) => {
      render(<TripCalendarWorkspace layout={layout} />);
      expect(screen.getByLabelText('From')).toHaveValue('2027-12-28');
      expect(screen.getByLabelText('To')).toHaveValue('2028-01-03');
      expect(screen.getByRole('article', { name: 'POA → REC Departure' })).toBeInTheDocument();
      selectKind('Availability');
      const results = screen.getByRole('region', { name: 'Calendar results' });
      expect(
        within(results).queryByRole('article', { name: 'POA → REC Departure' })
      ).not.toBeInTheDocument();
      expect(within(results).getAllByRole('article').length).toBeGreaterThan(0);
      fireEvent.change(screen.getByLabelText('To'), { target: { value: '2027-12-28' } });
      expect(screen.getByRole('region', { name: '2027-12-28' })).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: '2027-12-29' })).not.toBeInTheDocument();
    }
  );

  it('accepts free IANA zone text and retains source flight clocks in the selected source dialog', () => {
    render(<TripCalendarWorkspace layout="timeline" />);
    fireEvent.change(screen.getByLabelText('Display zone'), {
      target: { value: 'Pacific/Honolulu' },
    });
    expect(screen.queryByText('Choose a valid IANA display time zone.')).not.toBeInTheDocument();
    const departure = screen.getByRole('article', { name: 'POA → REC Departure' });
    fireEvent.click(within(departure).getByRole('button', { name: 'Open POA → REC Departure' }));
    const dialog = screen.getByRole('dialog', { name: 'POA → REC' });
    expect(dialog).toHaveTextContent('29 Dec 2027 · 00:15 · America/Sao_Paulo');
    expect(dialog).toHaveTextContent('29 Dec 2027 · 03:40 · America/Recife');
  });

  it('rejects an invalid display zone instead of retaining an apparently valid calendar axis', () => {
    render(<TripCalendarWorkspace layout="agenda" />);
    fireEvent.change(screen.getByLabelText('Display zone'), { target: { value: 'Not/AZone' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a valid IANA display time zone.');
    expect(screen.queryByRole('region', { name: 'Calendar results' })).not.toBeInTheDocument();
  });

  it('applies the selected flight window using the display zone and preserves source identities', () => {
    render(<TripCalendarWorkspace layout="agenda" />);
    fireEvent.change(screen.getByLabelText('Display zone'), {
      target: { value: 'Australia/Sydney' },
    });
    selectFlight(/SYD → DFW/);
    fireEvent.click(screen.getByRole('button', { name: 'Around this flight' }));
    expect(screen.getByLabelText('From')).toHaveValue('2027-11-23');
    expect(screen.getByLabelText('To')).toHaveValue('2027-11-26');
    const departure = screen.getByRole('article', { name: 'SYD → DFW Departure' });
    fireEvent.click(within(departure).getByRole('button', { name: 'Open SYD → DFW Departure' }));
    expect(screen.getByRole('dialog', { name: 'SYD → DFW' })).toHaveTextContent(
      '24 Nov 2027 · 10:00 · Australia/Sydney'
    );
  });

  it('shows reversed date range errors and keeps invalid source clocks inspectable', () => {
    render(<TripCalendarWorkspace layout="agenda" scenario="missing-time" />);
    const findings = screen.getByRole('region', { name: 'Timing findings' });
    fireEvent.click(within(findings).getByRole('button', { name: 'Open POA → REC' }));
    expect(screen.getByRole('dialog', { name: 'POA → REC' })).toHaveTextContent(
      'Invalid source time: 2027-12-29'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2028-02-01' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Start date must be on or before end date.'
    );
    expect(screen.queryByRole('region', { name: 'Calendar results' })).not.toBeInTheDocument();
  });

  it('keeps only purchased outlines solid while tentative bookings and floating rental dates remain dashed', () => {
    render(<TripCalendarWorkspace layout="agenda" />);
    expect(screen.getByRole('article', { name: 'Dinner with friends Start' })).toHaveClass(
      'border-dashed'
    );
    expect(screen.getByRole('article', { name: 'POA → REC Departure' })).toHaveClass(
      'border-solid'
    );
    selectKind('Rentals');
    const results = screen.getByRole('region', { name: 'Calendar results' });
    expect(within(results).getAllByText('All day').length).toBeGreaterThan(0);
    for (const article of within(results).getAllByRole('article'))
      expect(article).toHaveClass('border-dashed');
  });

  it('rejects a flight window with missing source clocks without replacing the explicit range', () => {
    render(<TripCalendarWorkspace layout="agenda" scenario="missing-time" />);
    selectFlight(/^POA → REC$/);
    fireEvent.click(screen.getByRole('button', { name: 'Around this flight' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose a flight with valid departure and arrival times.'
    );
    expect(screen.getByLabelText('From')).toHaveValue('2027-12-28');
    expect(screen.getByLabelText('To')).toHaveValue('2028-01-03');
  });
  it('shows a computed empty state for an empty source and a filter with no matching entries', () => {
    const { unmount } = render(<TripCalendarWorkspace layout="agenda" scenario="empty" />);
    expect(screen.getByRole('status')).toHaveTextContent('No entries in this range');
    unmount();
    render(<TripCalendarWorkspace layout="agenda" />);
    selectKind('Flights');
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2027-12-28' } });
    expect(screen.getByRole('status')).toHaveTextContent('No entries in this range');
    expect(screen.queryByRole('region', { name: 'Calendar results' })).not.toBeInTheDocument();
  });
  it.each(['agenda', 'timeline'] as const)(
    'opens source records through native card buttons without repeated action labels in %s',
    (layout) => {
      render(<TripCalendarWorkspace layout={layout} />);
      expect(screen.queryByText(/^Inspect(?: |$)/)).not.toBeInTheDocument();
      const card = screen.getByRole('article', { name: 'POA → REC Departure' });
      const trigger = within(card).getByRole('button', { name: 'Open POA → REC Departure' });
      expect(trigger.tagName).toBe('BUTTON');
      expect(trigger).toHaveAttribute('type', 'button');
      expect(trigger.querySelector('button, a, input, p, div, h3')).toBeNull();
      expect(trigger).toHaveTextContent('Porto Alegre → Recife');
      trigger.focus();
      expect(trigger).toHaveFocus();
      fireEvent.click(trigger);
      expect(screen.getByRole('dialog', { name: 'POA → REC' })).toHaveTextContent(
        '29 Dec 2027 · 03:40 · America/Recife'
      );
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      const [availability] = screen.getAllByRole('article', { name: /availability$/ });
      if (!availability) throw new Error('Expected floating availability card');
      const availabilityTrigger = within(availability).getByRole('button', {
        name: /Open .* availability/,
      });
      expect(availabilityTrigger.tagName).toBe('BUTTON');
      expect(availabilityTrigger.querySelector('button, a, input, p, div, h3')).toBeNull();
      fireEvent.click(availabilityTrigger);
      expect(screen.getByRole('dialog', { name: 'Marina Duarte' })).toBeInTheDocument();
    }
  );
});
