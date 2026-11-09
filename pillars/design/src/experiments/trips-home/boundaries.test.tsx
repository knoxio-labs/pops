import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TripsHomeWorkspace } from './workspace';

describe('trips home boundary states', () => {
  it.each(['list', 'grouped'] as const)(
    'keeps open and contradictory boundaries visible without inventing dates in %s',
    (layout) => {
      const view = render(<TripsHomeWorkspace layout={layout} scenario="open-dates" />);
      const open = screen.getByRole('button', { name: /Curitiba/ });
      expect(open).toHaveTextContent('13 Dec 2027 →');
      expect(open).not.toHaveTextContent('20 Dec');
      fireEvent.click(screen.getByRole('combobox', { name: 'View trips' }));
      fireEvent.click(screen.getByRole('option', { name: 'Current' }));
      expect(screen.queryByRole('button', { name: /Curitiba/ })).not.toBeInTheDocument();
      view.unmount();
      render(<TripsHomeWorkspace layout={layout} scenario="conflicting-dates" />);
      expect(screen.getByRole('button', { name: /Curitiba/ })).toHaveTextContent(
        '20 Dec 2027 → 13 Dec 2027'
      );
    }
  );

  it.each(['list', 'grouped'] as const)(
    'allows an entirely blank optional settings draft in %s',
    (layout) => {
      render(<TripsHomeWorkspace layout={layout} scenario="empty" />);
      fireEvent.click(screen.getByRole('button', { name: 'New trip' }));
      fireEvent.click(screen.getByRole('button', { name: 'Create trip' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Trip' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    }
  );
});

describe('compact trip labels', () => {
  it.each(['list', 'grouped'] as const)('does not repeat a one-stop trip title in %s', (layout) => {
    render(<TripsHomeWorkspace layout={layout} />);
    const row = screen.getByRole('button', { name: /Curitiba/ });
    expect(within(row).getAllByText('Curitiba')).toHaveLength(1);
  });
});
