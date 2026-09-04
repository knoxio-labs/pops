import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AccountSelect } from './AccountSelect';

import type { AccountOption } from './account-shared/types';

const ACCOUNTS: AccountOption[] = [
  {
    id: 'a1',
    name: 'Everyday',
    kind: 'checking',
    institution: { id: 'anz', name: 'ANZ', colour: '#0072ac' },
  },
  {
    id: 'a2',
    name: 'Amex',
    kind: 'credit-card',
    institution: { id: 'amex', name: 'Amex', colour: '#1c6fba' },
  },
  {
    id: 'a3',
    name: 'Old ANZ',
    kind: 'savings',
    archived: true,
    institution: { id: 'anz', name: 'ANZ', colour: '#0072ac' },
  },
];

async function openPicker() {
  await userEvent.click(screen.getByRole('combobox'));
  return screen.getByPlaceholderText('Search accounts...');
}

describe('AccountSelect — selection', () => {
  it('reports both the id and the full account when one is picked', async () => {
    const onChange = vi.fn();
    render(<AccountSelect accounts={ACCOUNTS} onChange={onChange} aria-label="Account" />);

    await openPicker();
    await userEvent.click(screen.getByText('Amex'));

    expect(onChange).toHaveBeenCalledExactlyOnceWith('a2', ACCOUNTS[1]);
  });

  it('renders the selected account name on the trigger', () => {
    render(<AccountSelect accounts={ACCOUNTS} value="a1" aria-label="Account" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Everyday');
  });

  it('falls back to the placeholder when the value matches no known account', () => {
    render(
      <AccountSelect
        accounts={ACCOUNTS}
        value="deleted"
        placeholder="Choose..."
        aria-label="Account"
      />
    );
    expect(screen.getByRole('combobox')).toHaveTextContent('Choose...');
  });

  it('names the trigger from aria-label, which the combobox role needs', () => {
    render(<AccountSelect accounts={ACCOUNTS} value="a1" aria-label="Account" />);
    expect(screen.getByRole('combobox', { name: 'Account' })).toBeInTheDocument();
  });
});

describe('AccountSelect — clear row', () => {
  it('is absent unless onClear is supplied', async () => {
    render(<AccountSelect accounts={ACCOUNTS} aria-label="Account" />);
    await openPicker();
    expect(screen.queryByText('All accounts')).not.toBeInTheDocument();
  });

  it('clears the selection without firing onChange', async () => {
    const onClear = vi.fn();
    const onChange = vi.fn();
    render(
      <AccountSelect
        accounts={ACCOUNTS}
        value="a1"
        onChange={onChange}
        onClear={onClear}
        aria-label="Account"
      />
    );

    await openPicker();
    await userEvent.click(screen.getByText('All accounts'));

    expect(onClear).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('AccountSelect — archived accounts', () => {
  it('hides archived accounts behind a reveal row by default', async () => {
    render(<AccountSelect accounts={ACCOUNTS} aria-label="Account" />);
    await openPicker();

    expect(screen.queryByText('Old ANZ')).not.toBeInTheDocument();
    expect(screen.getByText('Show 1 archived')).toBeInTheDocument();
  });

  it('reveals archived accounts once the reveal row is picked', async () => {
    render(<AccountSelect accounts={ACCOUNTS} aria-label="Account" />);
    await openPicker();

    await userEvent.click(screen.getByText('Show 1 archived'));

    expect(screen.getByText('Old ANZ')).toBeInTheDocument();
    expect(screen.queryByText('Show 1 archived')).not.toBeInTheDocument();
  });

  it('is absent when no account is archived', async () => {
    render(<AccountSelect accounts={ACCOUNTS.filter((a) => !a.archived)} aria-label="Account" />);
    await openPicker();
    expect(screen.queryByText(/archived/i)).not.toBeInTheDocument();
  });
});

describe('AccountSelect — search by subtitle', () => {
  it('matches an institution name that is not the account name itself', async () => {
    const onChange = vi.fn();
    render(<AccountSelect accounts={ACCOUNTS} onChange={onChange} aria-label="Account" />);

    const search = await openPicker();
    await userEvent.type(search, 'ANZ');

    expect(screen.getByRole('option', { name: /Everyday/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Amex/ })).not.toBeInTheDocument();
  });
});
