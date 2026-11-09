import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createArrangementState } from './fixture';
import { arrangementRows } from './model';
import { ArrangementsWorkspace } from './workspace';

function rowName(id: string) {
  const row = arrangementRows(createArrangementState()).find((item) => item.id === id);
  if (!row) throw new Error(`Missing source arrangement ${id}`);
  return row.name;
}

function openSource(id: string) {
  const name = rowName(id);
  const article = screen.getByRole('article', { name });
  const button = within(article).getByRole('button', { name: `Open ${name}` });
  expect(button.tagName).toBe('BUTTON');
  expect(button).toHaveAttribute('type', 'button');
  fireEvent.click(button);
  return screen.getByRole('dialog', { name });
}

describe('arrangement grouping proposals', () => {
  it.each(['route', 'kinds'] as const)(
    'opens each selected arrangement source without repeated inspect labels in %s',
    (layout) => {
      render(<ArrangementsWorkspace layout={layout} />);
      expect(screen.queryByText(/^Inspect(?: |$)/)).not.toBeInTheDocument();
      const dialog = openSource('flight');
      expect(dialog).toHaveTextContent('24 Nov 2027 · 10:00 · Australia/Sydney');
      expect(dialog).toHaveTextContent('25 Nov 2027 · 00:30 · America/Sao_Paulo');
      expect(dialog).toHaveTextContent('Fictional ticket conditions');
      expect(within(dialog).getAllByText(/^Purchased$/)).toHaveLength(1);
      expect(within(dialog).getByRole('region', { name: 'Policy source' })).toHaveTextContent(
        /AUD.*180/
      );
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(openSource('ticket')).not.toHaveTextContent('Fictional ticket conditions');
    }
  );

  it('discloses filters once and retains removable selections when collapsed', () => {
    render(<ArrangementsWorkspace layout="kinds" />);
    expect(screen.queryByRole('combobox', { name: 'Kind' })).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Filters' });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('combobox', { name: 'Kind' }));
    fireEvent.click(screen.getByRole('option', { name: 'Stays' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Purchase state' }));
    fireEvent.click(screen.getByRole('option', { name: 'Purchased' }));
    fireEvent.click(toggle);
    expect(screen.queryByRole('combobox', { name: 'Kind' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear kind filter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear purchase filter' })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: rowName('flight') })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear kind filter' }));
    expect(screen.getByRole('article', { name: rowName('flight') })).toBeInTheDocument();
  });

  it('shows no policy promise or fee when the selected source has none', () => {
    render(<ArrangementsWorkspace layout="route" />);
    const dialog = openSource('ticket');
    expect(within(dialog).queryByRole('region', { name: 'Policy source' })).not.toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('Change cost');
    expect(dialog).not.toHaveTextContent('Cancellation deadline');
    expect(dialog).not.toHaveTextContent(/free cancellation|refundable/i);
  });

  it('shows invalid source policy values and findings without a clock or currency fallback', () => {
    render(<ArrangementsWorkspace layout="route" scenario="invalid-policy" />);
    const dialog = openSource('flight');
    expect(dialog).toHaveTextContent('Invalid source time: 2027-02-30T10:00:00Z · Invalid/Zone');
    expect(dialog).toHaveTextContent('The source cancellation time or zone is invalid.');
    expect(dialog).toHaveTextContent('The source change cost or currency is invalid.');
    expect(dialog).not.toHaveTextContent('AUD 180');
  });

  it('keeps unknown dates empty instead of borrowing visit bounds or inventing coverage nights', () => {
    render(<ArrangementsWorkspace layout="route" scenario="unknown-dates" />);
    const dialog = openSource('hotel');
    expect(dialog).not.toHaveTextContent('Dates');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Accommodation not recorded')).not.toBeInTheDocument();
  });

  it('preserves missing visit references as distinct source context', () => {
    render(<ArrangementsWorkspace layout="route" scenario="missing-reference" />);
    const group = screen.getByRole('region', { name: 'Visit unavailable' });
    expect(group).toHaveTextContent(rowName('hotel'));
    expect(openSource('hotel')).toHaveTextContent('Visit unavailable');
  });

  it('uses purchased flags as the only hard visual tier and keeps search/empty results functional', () => {
    render(<ArrangementsWorkspace layout="kinds" />);
    expect(screen.getByRole('article', { name: rowName('flight') })).toHaveClass('border-solid');
    expect(screen.getByRole('article', { name: rowName('connection') })).toHaveClass(
      'border-dashed'
    );
    fireEvent.change(screen.getByLabelText('Search arrangements'), {
      target: { value: 'no source matches this' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('No matching arrangements');
  });
  it('shows actual gap endpoints before any disclosure without inventing a booking action', () => {
    render(<ArrangementsWorkspace layout="route" />);
    const coverage = screen.getByRole('region', { name: 'Coverage issues' });
    expect(within(coverage).getByText('São Paulo → Curitiba')).toBeVisible();
    expect(
      within(coverage).queryByRole('button', { name: /book|reserve|purchase/i })
    ).not.toBeInTheDocument();
  });

  it('shows the empty source state without synthesising arrangements or coverage', () => {
    render(<ArrangementsWorkspace layout="route" scenario="empty" />);
    expect(screen.getByRole('status')).toHaveTextContent('No matching arrangements');
    expect(screen.queryByRole('region', { name: 'Coverage issues' })).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
  it('surfaces only explicit policy costs and deadlines before opening source details', () => {
    render(<ArrangementsWorkspace layout="route" />);
    const flight = screen.getByRole('article', { name: rowName('flight') });
    expect(flight).toHaveTextContent(
      'Cancellation deadline 23 Nov 2027 · 10:00 · Australia/Sydney'
    );
    expect(flight).toHaveTextContent(/Change cost AUD.*180/);
    const ticket = screen.getByRole('article', { name: rowName('ticket') });
    expect(ticket).not.toHaveTextContent('Change cost');
    expect(ticket).not.toHaveTextContent('Cancellation deadline');
  });
});
