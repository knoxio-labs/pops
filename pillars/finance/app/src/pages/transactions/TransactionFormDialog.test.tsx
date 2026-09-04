import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { TransactionFormDialog } from './TransactionFormDialog';
import {
  DEFAULT_TRANSACTION_VALUES,
  TransactionFormSchema,
  type TransactionFormValues,
} from './types';

import type { AccountOption } from '@pops/ui';

const ACCOUNTS: AccountOption[] = [
  { id: 'acc-credit', name: 'Credit Card', kind: 'credit-card' },
  { id: 'acc-debit', name: 'Debit Card', kind: 'checking' },
];

function Harness({ defaultValues }: { defaultValues?: Partial<TransactionFormValues> }) {
  const form = useForm<TransactionFormValues>({
    resolver: standardSchemaResolver(TransactionFormSchema),
    defaultValues: { ...DEFAULT_TRANSACTION_VALUES, ...defaultValues },
  });
  return (
    <TransactionFormDialog
      open
      onOpenChange={vi.fn()}
      editingTransaction={null}
      form={form}
      isSubmitting={false}
      onSubmit={vi.fn()}
      entities={[]}
      accounts={ACCOUNTS}
    />
  );
}

describe('TransactionFormDialog — account picker', () => {
  it('renders a picker, not a free-text input, for the account field', () => {
    render(<Harness />);

    expect(screen.getByRole('combobox', { name: 'Account' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Account', { selector: 'input' })).not.toBeInTheDocument();
  });

  it('sets accountId on the form when an account is picked', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('combobox', { name: 'Account' }));
    await user.click(await screen.findByText('Debit Card'));

    expect(await screen.findByRole('combobox', { name: 'Account' })).toHaveTextContent(
      'Debit Card'
    );
  });

  it('shows the transaction’s current account when editing', () => {
    render(<Harness defaultValues={{ accountId: 'acc-credit' }} />);

    expect(screen.getByRole('combobox', { name: 'Account' })).toHaveTextContent('Credit Card');
  });
});
