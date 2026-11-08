import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { JourneyWorkspace } from './workspace';

describe('journey editing', () => {
  it.each(['legs', 'window'] as const)(
    'adds a soft segment and restores the %s view with undo',
    (layout) => {
      render(<JourneyWorkspace layout={layout} />);
      fireEvent.click(screen.getByRole('button', { name: 'Add transport' }));
      fireEvent.click(screen.getByRole('button', { name: 'Bus' }));
      expect(screen.getByRole('article', { name: 'leg 3' })).toHaveTextContent('Considering');
      expect(screen.getByRole('article', { name: 'leg 1' })).toHaveTextContent('Purchased');
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.queryByRole('article', { name: 'leg 3' })).not.toBeInTheDocument();
    }
  );

  it('recalculates clocks on blur without changing purchase state and undoes the edit', () => {
    render(<JourneyWorkspace layout="legs" />);
    const departure = screen.getByLabelText('Departure time · leg 2');
    fireEvent.change(departure, { target: { value: '2028-01-15T09:00' } });
    fireEvent.blur(departure);
    expect(screen.getByRole('region', { name: 'Journey issues' })).toHaveTextContent(
      '45 min connection'
    );
    expect(screen.getByRole('article', { name: 'leg 2' })).toHaveTextContent('Purchased');
    expect(screen.getByRole('article', { name: 'leg 2' })).toHaveClass('border-destructive');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Departure time · leg 2')).toHaveValue('2028-01-15T11:00');
    expect(screen.queryByText(/45 min connection/)).not.toBeInTheDocument();
  });

  it('links an original identity, removes only its association, and restores it with undo', () => {
    render(<JourneyWorkspace layout="legs" />);
    fireEvent.click(screen.getByRole('button', { name: 'Link document' }));
    fireEvent.click(screen.getByRole('option', { name: 'Fictional receipt.pdf' }));
    expect(screen.getByRole('region', { name: 'Journey documents' })).toHaveTextContent(
      'Fictional receipt.pdf'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Unlink Fictional receipt.pdf' }));
    expect(
      screen.queryByRole('button', { name: 'Unlink Fictional receipt.pdf' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(
      screen.getByRole('button', { name: 'Unlink Fictional receipt.pdf' })
    ).toBeInTheDocument();
  });

  it('creates a location with explicit metadata while retaining the source clock', () => {
    render(<JourneyWorkspace layout="legs" />);
    fireEvent.click(screen.getByRole('button', { name: 'Arrival location · leg 2' }));
    fireEvent.click(screen.getByText('New location'));
    fireEvent.change(screen.getByLabelText('Location name'), {
      target: { value: 'Recife Airport' },
    });
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'REC' } });
    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'America/Recife' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add location' }));
    expect(screen.getByRole('button', { name: 'Arrival location · leg 2' })).toHaveTextContent(
      'REC'
    );
    expect(screen.getByLabelText('Arrival time zone · leg 2')).toHaveValue('America/Recife');
    expect(screen.getByLabelText('Arrival time · leg 2')).toHaveValue('2028-01-16T00:30');
  });

  it('retains unavailable document references and changes only the chosen leg status', () => {
    render(<JourneyWorkspace layout="legs" scenario="missing-reference" />);
    expect(screen.getByText('Document unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Status · leg 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reserved' }));
    expect(
      within(screen.getByRole('article', { name: 'leg 2' })).getByRole('button', {
        name: 'Status · leg 2',
      })
    ).toHaveTextContent('Reserved');
    expect(screen.getByRole('article', { name: 'leg 1' })).toHaveTextContent('Purchased');
  });
  it('previews red conflicts without moving the warning area, then commits retained clocks on drop', () => {
    const view = render(<JourneyWorkspace layout="legs" />);
    const first = view.container.querySelector('[data-sortable-key="syd-dfw"]');
    const second = view.container.querySelector('[data-sortable-key="dfw-gru"]');
    if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement))
      throw new Error('Sortable leg missing');
    const dataTransfer = {
      setData: vi.fn(),
      setDragImage: vi.fn(),
      effectAllowed: '',
      dropEffect: '',
    };
    const warning = screen.getByRole('region', { name: 'Journey issues' }).textContent;
    fireEvent.dragStart(second, { dataTransfer });
    fireEvent.dragOver(first, { dataTransfer });
    expect(screen.getByRole('region', { name: 'Journey issues' }).textContent).toBe(warning);
    expect(first).toHaveAttribute('style', 'order: 1;');
    expect(within(first).getByRole('article', { name: 'leg 1' })).toHaveClass('border-destructive');
    fireEvent.drop(first, { dataTransfer });
    expect(screen.getByRole('region', { name: 'Journey issues' })).toHaveTextContent(
      'Departure precedes previous arrival'
    );
    expect(screen.getByLabelText('Departure time · leg 1')).toHaveValue('2028-01-15T11:00');
    expect(screen.getByRole('article', { name: 'leg 1' })).toHaveTextContent('Purchased');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Departure time · leg 1')).toHaveValue('2028-01-15T10:00');
  });
  it('starts an empty journey without silently selecting documents or inventing a booking reference', () => {
    render(<JourneyWorkspace layout="legs" scenario="empty" />);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByText('Fictional itinerary.pdf')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('References and timing'));
    expect(screen.getByLabelText('Journey reference')).toHaveValue('');
    expect(screen.getByLabelText('Journey notes')).toHaveValue('');
  });
});
