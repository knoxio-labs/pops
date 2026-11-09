import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BusinessWorkspace } from './workspace';

describe('business detail proposals', () => {
  it.each(['details', 'locations'] as const)(
    'edits a method and restores it through shared Undo in %s',
    (layout) => {
      render(<BusinessWorkspace layout={layout} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit Reservations email' }));
      fireEvent.change(screen.getByLabelText('Value'), {
        target: { value: 'changed@example.test' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(screen.getByText('changed@example.test')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.getByText('reservations@carmo.example.test')).toBeInTheDocument();
      expect(screen.queryByText('changed@example.test')).not.toBeInTheDocument();
    }
  );

  it('rejects unsafe website drafts without creating a link or history entry', () => {
    render(<BusinessWorkspace layout="details" scenario="empty" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add website' }));
    fireEvent.change(screen.getByLabelText('Website URL'), {
      target: { value: 'javascript:alert(1)' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('HTTP or HTTPS');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Website URL'), {
      target: { value: 'https://new.example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('link', { name: 'https://new.example.test' })).toHaveAttribute(
      'href',
      'https://new.example.test'
    );
  });

  it('retains arrangements and source contacts after a location is removed, then restores the grouping', () => {
    render(<BusinessWorkspace layout="locations" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Olinda guesthouse' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('article', { name: 'Olinda stay' })).toHaveTextContent(
      'Location unavailable'
    );
    expect(screen.getByRole('region', { name: 'Other linked people' })).toHaveTextContent(
      'Marina Duarte'
    );
    expect(screen.getByRole('region', { name: 'Unavailable references' })).toHaveTextContent(
      'location is unavailable'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    const location = screen.getByRole('region', { name: 'Olinda guesthouse' });
    expect(within(location).getByRole('article', { name: 'Olinda stay' })).toBeInTheDocument();
    expect(location).toHaveTextContent('Marina Duarte');
  });

  it('links only an existing contact with a free-text role and no location, then removes the association', () => {
    render(<BusinessWorkspace layout="details" scenario="empty" />);
    expect(screen.getByRole('button', { name: 'Add location' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add contact method' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Link person' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Contact' }));
    fireEvent.click(screen.getByRole('option', { name: 'Marina Duarte' }));
    fireEvent.change(screen.getByLabelText('Role'), {
      target: { value: 'After-hours coordinator' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('After-hours coordinator')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Marina Duarte' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByText('After-hours coordinator')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Link person' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Contact' }));
    expect(screen.getByRole('option', { name: 'Marina Duarte' })).toBeInTheDocument();
  });

  it.each(['details', 'locations'] as const)(
    'keeps unavailable references visible in %s',
    (layout) => {
      render(<BusinessWorkspace layout={layout} scenario="missing-reference" />);
      expect(screen.getByText('Contact unavailable')).toBeInTheDocument();
      expect(screen.getByRole('article', { name: 'Olinda stay' })).toHaveTextContent(
        'Location unavailable'
      );
      expect(screen.getByRole('region', { name: 'Unavailable references' })).toHaveTextContent(
        'A linked contact is unavailable.'
      );
    }
  );
});
