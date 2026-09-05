import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ComboboxSelect } from './ComboboxSelect';

const OPTIONS = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
];

describe('ComboboxSelect — accessible name', () => {
  it('resolves the accessible name from aria-label', () => {
    render(<ComboboxSelect options={OPTIONS} aria-label="Account kind" />);

    expect(screen.getByRole('combobox', { name: 'Account kind' })).toBeInTheDocument();
  });

  it('resolves the accessible name from aria-labelledby', () => {
    render(
      <>
        <span id="account-kind-label">Account kind</span>
        <ComboboxSelect options={OPTIONS} aria-labelledby="account-kind-label" />
      </>
    );

    expect(screen.getByRole('combobox', { name: 'Account kind' })).toBeInTheDocument();
  });

  it('renders with no accessible name when neither is supplied', () => {
    render(<ComboboxSelect options={OPTIONS} />);

    expect(screen.getByRole('combobox', { name: '' })).toBeInTheDocument();
  });

  it('keeps an explicitly passed id authoritative', () => {
    render(<ComboboxSelect id="account-kind" options={OPTIONS} aria-label="Account kind" />);

    expect(screen.getByRole('combobox', { name: 'Account kind' })).toHaveAttribute(
      'id',
      'account-kind'
    );
  });

  it('always carries some id even when none is supplied, so a caller can target it', () => {
    render(<ComboboxSelect options={OPTIONS} aria-label="Account kind" />);

    const trigger = screen.getByRole('combobox', { name: 'Account kind' });
    expect(trigger.id).not.toBe('');
  });
});
