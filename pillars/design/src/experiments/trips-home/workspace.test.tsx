import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TripsHomeWorkspace } from './workspace';

function edit(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function filter(label: string) {
  fireEvent.click(screen.getByRole('combobox', { name: 'View trips' }));
  fireEvent.click(screen.getByRole('option', { name: label }));
}

describe('trips home proposals', () => {
  it.each(['list', 'grouped'] as const)(
    'searches and filters actual route boundaries without parsing When in %s',
    (layout) => {
      render(<TripsHomeWorkspace layout={layout} />);
      edit('Search trips', 'Portugal');
      expect(screen.getByRole('button', { name: /Portugal/ })).toHaveTextContent('Around July');
      filter('Upcoming');
      expect(screen.queryByRole('button', { name: /Portugal/ })).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('No trips found.');
      filter('Other');
      expect(screen.getByRole('button', { name: /Portugal/ })).toBeInTheDocument();
      edit('Search trips', '');
      filter('Current');
      expect(screen.getByRole('button', { name: /Curitiba/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Hobart/ })).not.toBeInTheDocument();
    }
  );

  it.each(['list', 'grouped'] as const)(
    'opens the selected record rather than an unrelated overview in %s',
    (layout) => {
      render(<TripsHomeWorkspace layout={layout} />);
      fireEvent.click(screen.getByRole('button', { name: /Hobart/ }));
      expect(screen.getByRole('heading', { level: 1, name: 'Hobart' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Route' })).toHaveTextContent('Hobart');
      expect(screen.getByRole('region', { name: 'Route' })).toHaveTextContent('10 Sept 2027');
      expect(screen.queryByText('Sydney → São Paulo')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Trips' }));
      expect(screen.getByRole('button', { name: /^Brazil/ })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Portugal/ }));
      expect(screen.getByRole('heading', { level: 1, name: 'Portugal' })).toBeInTheDocument();
      expect(screen.getByText('Around July')).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Route' })).not.toBeInTheDocument();
    }
  );

  it.each(['list', 'grouped'] as const)(
    'creates free-text timing without dates and undoes only that creation in %s',
    (layout) => {
      render(<TripsHomeWorkspace layout={layout} scenario="empty" />);
      fireEvent.click(screen.getByRole('button', { name: 'New trip' }));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByLabelText('Destination')).toHaveValue('');
      expect(within(dialog).getByLabelText('Name')).toHaveValue('');
      expect(within(dialog).getByLabelText('When')).toHaveValue('');
      expect(within(dialog).getByRole('combobox', { name: 'Shared tag' })).toBeInTheDocument();
      expect(within(dialog).getByRole('combobox', { name: 'Parent trip' })).toBeInTheDocument();
      edit('Destination', 'Japan');
      edit('When', 'After graduation, maybe');
      fireEvent.click(screen.getByRole('button', { name: 'Create trip' }));
      const created = screen.getByRole('button', { name: /Japan/ });
      expect(created).toHaveTextContent('After graduation, maybe');
      expect(created).not.toHaveTextContent('2027');
      fireEvent.click(created);
      expect(screen.queryByRole('region', { name: 'Route' })).not.toBeInTheDocument();
      expect(screen.getByText('After graduation, maybe')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Trips' }));
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.queryByRole('button', { name: /Japan/ })).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('No trips found.');
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    }
  );

  it.each(['list', 'grouped'] as const)(
    'retains dismissed creation drafts and discards them only on Cancel in %s',
    (layout) => {
      render(<TripsHomeWorkspace layout={layout} />);
      fireEvent.click(screen.getByRole('button', { name: 'New trip' }));
      edit('Destination', 'Resumable draft');
      edit('When', 'When the trains line up');
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      fireEvent.click(screen.getByRole('button', { name: 'New trip' }));
      expect(screen.getByLabelText('Destination')).toHaveValue('Resumable draft');
      expect(screen.getByLabelText('When')).toHaveValue('When the trains line up');
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('button', { name: /Resumable draft/ })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Curitiba/ })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'New trip' }));
      expect(screen.getByLabelText('Destination')).toHaveValue('');
    }
  );

  it.each(['list', 'grouped'] as const)(
    'shows unavailable parent references without substituting another trip in %s',
    (layout) => {
      render(<TripsHomeWorkspace layout={layout} scenario="missing-parent" />);
      const row = screen.getByRole('button', { name: /Olinda/ });
      expect(row).toHaveTextContent('Parent unavailable');
      fireEvent.click(row);
      expect(screen.getByText('Parent unavailable')).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Route' })).toHaveTextContent('Olinda');
    }
  );
});
