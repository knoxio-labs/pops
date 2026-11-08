import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SettingsWorkspace } from './workspace';

describe('trip creation and settings', () => {
  it.each(['quick', 'full'] as const)(
    'creates a blank trip without optional inputs in %s',
    (layout) => {
      render(<SettingsWorkspace layout={layout} scenario="empty" />);
      expect(screen.getByRole('button', { name: 'Create trip' })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: 'Create trip' }));
      expect(screen.getByRole('heading', { name: 'Trip settings' })).toBeInTheDocument();
      expect(screen.getByText('Saved')).toBeInTheDocument();
      expect(screen.getByLabelText('Name')).toHaveValue('');
      expect(screen.getByLabelText('Start')).toHaveValue('');
      expect(screen.getByLabelText('End')).toHaveValue('');
      expect(screen.getByRole('combobox', { name: 'Shared tag' })).toHaveTextContent('Choose tag');
      expect(screen.getByRole('combobox', { name: 'Parent trip' })).toHaveTextContent(
        'Choose trip'
      );
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.getByRole('button', { name: 'Create trip' })).toBeEnabled();
    }
  );

  it('exposes full settings after quick creation and restores saved values on discard', () => {
    render(<SettingsWorkspace layout="quick" />);
    expect(screen.getByText('More options').closest('details')).not.toHaveAttribute('open');
    fireEvent.click(screen.getByRole('button', { name: 'Create trip' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Brazil with family' } });
    expect(screen.getByText('Brazil with family', { selector: 'p' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Unsaved edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Brazil with family');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } });
    expect(screen.getByText('Brazil · 2027', { selector: 'p' })).toBeInTheDocument();
  });

  it('does not borrow dates or tag identity when changing parent', () => {
    render(<SettingsWorkspace layout="full" scenario="existing" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Parent trip' }));
    expect(screen.queryByRole('option', { name: 'Olinda' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Rio weekend' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'South America' }));
    expect(screen.getByLabelText('Start')).toHaveValue('2027-11-24');
    expect(screen.getByLabelText('End')).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Shared tag' })).toHaveTextContent(
      'Travel / Brazil'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove parent trip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('combobox', { name: 'Parent trip' })).toHaveTextContent(
      'South America'
    );
  });

  it('blocks a reversed range without clamping either date', () => {
    render(<SettingsWorkspace layout="full" scenario="reversed-dates" />);
    expect(screen.getByRole('region', { name: 'Settings issues' })).toHaveTextContent(
      'end date is before'
    );
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByLabelText('End')).toHaveValue('2027-11-23');
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '' } });
    expect(screen.queryByRole('region', { name: 'Settings issues' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('clears missing optional references and preserves the reusable catalogue', () => {
    render(<SettingsWorkspace layout="full" scenario="missing-reference" />);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Unlink shared tag' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove parent trip' }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    fireEvent.click(screen.getByRole('combobox', { name: 'Shared tag' }));
    expect(screen.getByRole('option', { name: 'Travel / Brazil' })).toBeInTheDocument();
  });
});
