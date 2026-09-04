import { Archive, Loader2 } from 'lucide-react';
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
  onArchiveToggle: (account: Account) => void;
  isArchiving: boolean;
}

/**
 * Archiving is not deleting — its transactions still reference the account,
 * so nothing is destroyed and there is nothing to confirm. Matches the design
 * playground's account-dashboard banner (`pillars/design/src/kit/account-dashboard.tsx`).
 */
function ArchivedBanner() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
      <Archive className="h-4 w-4" />
      Archived, not deleted — its transactions still reference it, so it stays out of pickers and
      totals until it is unarchived.
    </div>
  );
}

function ArchiveToggleButton({
  account,
  onArchiveToggle,
  isArchiving,
  disabled,
}: {
  account: Account;
  onArchiveToggle: (account: Account) => void;
  isArchiving: boolean;
  disabled: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="sm:mr-auto"
      onClick={() => onArchiveToggle(account)}
      disabled={disabled}
    >
      {isArchiving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      <Archive className="h-4 w-4" />
      {account.archivedAt !== null ? 'Unarchive account' : 'Archive account'}
    </Button>
  );
}

function AccountFormDialogFooter({
  editingAccount,
  onOpenChange,
  onArchiveToggle,
  isArchiving,
  isSubmitting,
  busy,
}: {
  editingAccount: Account | null;
  onOpenChange: (v: boolean) => void;
  onArchiveToggle: (account: Account) => void;
  isArchiving: boolean;
  isSubmitting: boolean;
  busy: boolean;
}) {
  return (
    <DialogFooter>
      {editingAccount && (
        <ArchiveToggleButton
          account={editingAccount}
          onArchiveToggle={onArchiveToggle}
          isArchiving={isArchiving}
          disabled={busy}
        />
      )}
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
        Cancel
      </Button>
      <Button type="submit" disabled={busy}>
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {editingAccount ? 'Save' : 'Create account'}
      </Button>
    </DialogFooter>
  );
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
    onArchiveToggle,
    isArchiving,
  } = props;
  const busy = isSubmitting || isArchiving;
  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
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
            {editingAccount?.archivedAt !== null && editingAccount && <ArchivedBanner />}
            <AccountFormFields
              form={form}
              account={editingAccount}
              institutions={institutions}
              currencies={currencies}
              onCreateInstitution={onCreateInstitution}
            />
          </div>
          <AccountFormDialogFooter
            editingAccount={editingAccount}
            onOpenChange={onOpenChange}
            onArchiveToggle={onArchiveToggle}
            isArchiving={isArchiving}
            isSubmitting={isSubmitting}
            busy={busy}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
