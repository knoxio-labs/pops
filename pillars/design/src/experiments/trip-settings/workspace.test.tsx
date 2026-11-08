import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SettingsWorkspace } from './workspace';

describe('trip creation and settings', () => {
  it.each(['quick', 'full'] as const)(
    'creates a blank trip without a When value or duplicate date inputs in %s',
    (layout) => {
      render(<SettingsWorkspace layout={layout} scenario="empty" />);
      fireEvent.click(screen.getByRole('button', { name: 'Create trip' }));
      expect(screen.getByText('Saved')).toBeInTheDocument();
      expect(screen.getByLabelText('When')).toHaveValue('');
      expect(screen.queryByLabelText('Start')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('End')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Month')).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: 'Planning window' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.getByRole('button', { name: 'Create trip' })).toBeEnabled();
    }
  );

  it.each(['Summer', 'Around July', 'After graduation, perhaps', '夏 2028?'])(
    'keeps %s as source subtitle text without interpreting dates',
    (when) => {
      render(<SettingsWorkspace layout="full" scenario="existing" />);
      fireEvent.change(screen.getByLabelText('When'), { target: { value: when } });
      expect(screen.getByLabelText('Trip subtitle')).toHaveTextContent(when);
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(screen.getByText('Saved')).toBeInTheDocument();
      expect(screen.getByLabelText('When')).toHaveValue(when);
      expect(screen.queryByRole('region', { name: 'Route dates' })).not.toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Settings issues' })).not.toBeInTheDocument();
    }
  );

  it('saves, discards and undoes subtitle edits independently of the name', () => {
    render(<SettingsWorkspace layout="full" scenario="season" />);
    fireEvent.click(screen.getByRole('button', { name: 'Create trip' }));
    fireEvent.change(screen.getByLabelText('When'), { target: { value: 'Around July' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    fireEvent.change(screen.getByLabelText('When'), { target: { value: '' } });
    expect(screen.queryByLabelText('Trip subtitle')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByLabelText('When')).toHaveValue('Around July');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Family visits' } });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByLabelText('Trip subtitle')).toHaveTextContent('Around July');
  });

  it.each(['month', 'season', 'arbitrary-when'] as const)(
    'starts the %s example as creation without a route',
    (scenario) => {
      render(<SettingsWorkspace layout="full" scenario={scenario} />);
      expect(screen.getByRole('heading', { name: 'New trip' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create trip' })).toBeEnabled();
      expect(screen.queryByRole('region', { name: 'Route dates' })).not.toBeInTheDocument();
      expect(screen.queryByText('From stops and journeys')).not.toBeInTheDocument();
    }
  );

  it('excludes descendants from parent selection and preserves route and When values', () => {
    render(<SettingsWorkspace layout="full" scenario="existing" />);
    const when = screen.getByLabelText('When').getAttribute('value');
    fireEvent.click(screen.getByRole('combobox', { name: 'Parent trip' }));
    expect(screen.queryByRole('option', { name: 'Olinda' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'South America' }));
    expect(screen.queryByRole('region', { name: 'Route dates' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('When')).toHaveValue(when);
    fireEvent.click(screen.getByRole('button', { name: 'Remove parent trip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('combobox', { name: 'Parent trip' })).toHaveTextContent(
      'South America'
    );
  });

  it('clears missing optional references without deleting reusable tags', () => {
    render(<SettingsWorkspace layout="full" scenario="missing-reference" />);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Unlink shared tag' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove parent trip' }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    fireEvent.click(screen.getByRole('combobox', { name: 'Shared tag' }));
    expect(screen.getByRole('option', { name: 'Travel / Brazil' })).toBeInTheDocument();
  });
});
