import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Select } from './Select';

const OPTIONS = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
];

describe('Select — accessible name', () => {
  it('resolves the accessible name from the label prop alone', () => {
    render(<Select label="Account kind" options={OPTIONS} />);

    expect(screen.getByRole('combobox', { name: 'Account kind' })).toBeInTheDocument();
  });

  it('associates the label with the control via a generated id/htmlFor pair', () => {
    render(<Select label="Account kind" options={OPTIONS} />);

    const select = screen.getByRole('combobox', { name: 'Account kind' });
    const label = screen.getByText('Account kind');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', select.id);
    expect(select.id).not.toBe('');
  });

  it('keeps an explicitly passed id authoritative', () => {
    render(<Select id="account-kind" label="Account kind" options={OPTIONS} />);

    const select = screen.getByRole('combobox', { name: 'Account kind' });
    expect(select).toHaveAttribute('id', 'account-kind');
  });

  it('lets an explicit aria-label override the label prop', () => {
    render(<Select label="Account kind" aria-label="Kind of account" options={OPTIONS} />);

    expect(screen.getByRole('combobox', { name: 'Kind of account' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Account kind' })).not.toBeInTheDocument();
  });

  it('renders with no accessible name when no label is supplied', () => {
    render(<Select options={OPTIONS} />);

    expect(screen.getByRole('combobox', { name: '' })).toBeInTheDocument();
  });
});
