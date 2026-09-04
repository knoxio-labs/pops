import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { AccountFormSchema, DEFAULT_ACCOUNT_FORM_VALUES, type Account } from './types';

/** Which account (if any) the dialog is editing, and the form bound to it. */
export function useAccountFormDialogState() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const form = useForm({
    resolver: standardSchemaResolver(AccountFormSchema),
    defaultValues: DEFAULT_ACCOUNT_FORM_VALUES,
  });

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingAccount(null);
  };
  const handleAdd = () => {
    setEditingAccount(null);
    form.reset(DEFAULT_ACCOUNT_FORM_VALUES);
    setIsDialogOpen(true);
  };
  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    form.reset({
      ...DEFAULT_ACCOUNT_FORM_VALUES,
      name: account.name,
      kind: account.kind,
      institutionId: account.institutionId,
      currency: account.currency,
    });
    setIsDialogOpen(true);
  };

  return {
    form,
    isDialogOpen,
    setIsDialogOpen: (open: boolean) => (open ? setIsDialogOpen(true) : closeDialog()),
    editingAccount,
    closeDialog,
    handleAdd,
    handleEdit,
  };
}
