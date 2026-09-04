import { useState } from 'react';

import { AccountSelect } from './AccountSelect';

import type { Meta, StoryObj } from '@storybook/react-vite';

import type { AccountOption } from './account-shared/types';

const meta: Meta<typeof AccountSelect> = {
  title: 'Forms/AccountSelect',
  component: AccountSelect,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

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
  { id: 'a3', name: 'Wallet', kind: 'cash' },
  {
    id: 'a4',
    name: 'Old ANZ',
    kind: 'savings',
    archived: true,
    institution: { id: 'anz', name: 'ANZ', colour: '#0072ac' },
  },
];

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState<string | undefined>(undefined);
    return (
      <div className="w-64">
        <AccountSelect
          accounts={ACCOUNTS}
          value={value}
          onChange={(id) => setValue(id)}
          aria-label="Account"
        />
      </div>
    );
  },
};

export const WithClear: Story = {
  render: () => {
    const [value, setValue] = useState<string | undefined>('a2');
    return (
      <div className="w-64">
        <AccountSelect
          accounts={ACCOUNTS}
          value={value}
          onChange={(id) => setValue(id)}
          onClear={() => setValue(undefined)}
          placeholder="All accounts"
          aria-label="Account filter"
        />
      </div>
    );
  },
};

export const Disabled: Story = {
  args: { accounts: ACCOUNTS, disabled: true, 'aria-label': 'Account' },
};
