import { type Account } from '@/fixtures/accounts';
import { AccountSelect } from '@/kit/account-select';
import { CircleSlash, Plus, Wallet } from 'lucide-react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  PageHeader,
  RadioInput,
} from '@pops/ui';

import { accountById, formatsForAccount, importableAccounts, radioOptions } from './context';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Account & format', order: 1, frame: 'web' };

function NoFormats({ account }: { account: Account }) {
  return (
    <Alert>
      <CircleSlash aria-hidden />
      <AlertTitle>Nothing to import into {account.name}</AlertTitle>
      <AlertDescription>
        <p>
          POPS has no parser for this account. A cash or gift-card balance has no statement to
          export, and an institution nobody has written a parser for has nothing POPS can read yet.
        </p>
        <p>Record these transactions by hand, or pick another account.</p>
      </AlertDescription>
    </Alert>
  );
}

function FormatSection({ account }: { account?: Account }) {
  if (!account) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
        Pick an account first — the formats on offer are the ones that account’s institution
        exports.
      </p>
    );
  }
  const formats = formatsForAccount(account);
  if (formats.length === 0) return <NoFormats account={account} />;
  return (
    <RadioInput
      label="File format"
      description={`What ${account.name} gives you when you export.`}
      options={radioOptions(formats)}
      defaultValue={formats[0]?.id}
      name="import-format"
    />
  );
}

function AddAccountHatch() {
  return (
    <p className="text-xs text-muted-foreground">
      Importing a bank POPS has never seen?{' '}
      <Button variant="link" className="h-auto p-0 text-xs" prefix={<Plus className="h-3 w-3" />}>
        Add the account
      </Button>{' '}
      — you come straight back here with it selected, and the file you already have stays chosen.
    </p>
  );
}

function NewAccountDialog() {
  return (
    <Dialog defaultOpen>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New account</DialogTitle>
          <DialogDescription>
            The same fields as the account form, opened over the import rather than instead of it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="new-account-name">Name</Label>
          <Input id="new-account-name" defaultValue="Bendigo Everyday" />
          <p className="text-xs text-muted-foreground">
            Kind, institution and currency follow, then this closes back onto the import.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button>Create and continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccountSection({
  accounts,
  selectedId,
  pickerOpen,
}: {
  accounts: Account[];
  selectedId?: string;
  pickerOpen: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Account</p>
      <AccountSelect
        accounts={accounts}
        initialId={selectedId}
        ariaLabel="Account to import into"
        placeholder="Which account is this statement for?"
        defaultOpen={pickerOpen}
      />
      <AddAccountHatch />
    </div>
  );
}

function Step({
  accounts,
  selectedId,
  pickerOpen = false,
  createOpen = false,
}: {
  accounts: Account[];
  selectedId?: string;
  pickerOpen?: boolean;
  createOpen?: boolean;
}) {
  const selected = selectedId ? accountById(selectedId) : undefined;
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <PageHeader
        title="Import transactions"
        description="Two choices, in this order: the account the money moved through, then the shape of the file your bank gave you."
      />
      {accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="An import files transactions against an account, so there has to be one first."
          action={<Button prefix={<Plus className="h-4 w-4" />}>Add an account</Button>}
        />
      ) : (
        <>
          <AccountSection accounts={accounts} selectedId={selectedId} pickerOpen={pickerOpen} />
          <FormatSection account={selected} />
        </>
      )}
      {createOpen && <NewAccountDialog />}
    </div>
  );
}

export default function ImportAccountStep() {
  return <Step accounts={importableAccounts} selectedId="a2" />;
}

export const states: ScreenStates = {
  choosing: () => <Step accounts={importableAccounts} pickerOpen />,
  'other-institution': () => <Step accounts={importableAccounts} selectedId="a1" />,
  'no-format-for-account': () => <Step accounts={importableAccounts} selectedId="a5" />,
  'no-accounts': () => <Step accounts={[]} />,
  'add-account': () => <Step accounts={importableAccounts} createOpen />,
};
