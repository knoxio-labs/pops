import { Loader2 } from 'lucide-react';
import { type UseFormReturn } from 'react-hook-form';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pops/ui';

import { AccountFormFields } from './AccountFormFields';

import type { CurrenciesListResponses } from '../../finance-api/index.js';
import type { Account, AccountFormValues, Institution } from './types';

type Currency = CurrenciesListResponses[200]['data'][number];

export interface AccountFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingAccount: Account | null;
  form: UseFormReturn<AccountFormValues>;
  institutions: Institution[];
  currencies: Currency[];
  onCreateInstitution: (name: string) => void;
  isSubmitting: boolean;
  onSubmit: (values: AccountFormValues) => void;
}

export function AccountFormDialog(props: AccountFormDialogProps) {
  const {
    open,
    onOpenChange,
    editingAccount,
    form,
    institutions,
    currencies,
    onCreateInstitution,
    isSubmitting,
    onSubmit,
  } = props;
  return (
    <Dialog open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>
              {editingAccount ? `Edit ${editingAccount.name}` : 'Add account'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Enter the details for this account
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <AccountFormFields
              form={form}
              account={editingAccount}
              institutions={institutions}
              currencies={currencies}
              onCreateInstitution={onCreateInstitution}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingAccount ? 'Save' : 'Create account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
