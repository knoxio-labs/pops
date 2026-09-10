import { type Account } from '@/fixtures/accounts';
import { type PendingImport, pendingImportById, pendingSets } from '@/fixtures/pending-imports';
import { AccountSelect } from '@/kit/account-select';
import { DiscardPendingDialog } from '@/kit/discard-pending-dialog';
import { ContinuePending, StartNewHeading } from '@/kit/import-continue-pending';
import { AddAccountHatch, NewAccountDialog } from '@/kit/import-new-account';
import { LiveFeedSection } from '@/kit/live-feed-section';
import { CircleSlash, Plus, Wallet } from 'lucide-react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  EmptyState,
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
        Pick an account first: the formats on offer are the ones that account’s institution exports.
      </p>
    );
  }
  const formats = formatsForAccount(account);
  if (formats.length === 0) return <NoFormats account={account} />;
  const live = formats[0]?.live === true;
  return (
    <>
      <RadioInput
        label={live ? 'Source' : 'File format'}
        description={
          live
            ? `${account.name} is fed by its bank. A file is only for history the feed never saw.`
            : `What ${account.name} gives you when you export.`
        }
        options={radioOptions(formats)}
        defaultValue={formats[0]?.id}
        name="import-format"
      />
      {live && <LiveFeedSection account={account} />}
    </>
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

const NO_PENDING: PendingImport[] = [];

function Step({
  accounts,
  selectedId,
  pickerOpen = false,
  createOpen = false,
  pending = NO_PENDING,
  discard,
}: {
  accounts: Account[];
  selectedId?: string;
  pickerOpen?: boolean;
  createOpen?: boolean;
  pending?: PendingImport[];
  discard?: PendingImport;
}) {
  const selected = selectedId ? accountById(selectedId) : undefined;
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <PageHeader
        title="Import transactions"
        description="Two choices, in this order: the account the money moved through, then the shape of the file your bank gave you."
      />
      <ContinuePending items={pending} />
      <StartNewHeading hasPending={pending.length > 0} />
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
      {discard && <DiscardPendingDialog item={discard} />}
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
  'live-feed-account': () => <Step accounts={importableAccounts} selectedId="a13" />,
  'pending-to-continue': () => <Step accounts={importableAccounts} pending={pendingSets.mixed} />,
  'pending-unusable': () => (
    <Step accounts={importableAccounts} pending={pendingSets.withUnusable} />
  ),
  'pending-open-elsewhere': () => (
    <Step accounts={importableAccounts} pending={pendingSets.openElsewhere} />
  ),
  'pending-open-stale': () => (
    <Step accounts={importableAccounts} pending={pendingSets.openStale} />
  ),
  'pending-unusable-causes': () => (
    <Step accounts={importableAccounts} pending={pendingSets.unusableCauses} />
  ),
  'discard-file-draft': () => (
    <Step
      accounts={importableAccounts}
      pending={pendingSets.mixed}
      discard={pendingImportById('p-amex-aug')}
    />
  ),
  'discard-live-import': () => (
    <Step
      accounts={importableAccounts}
      pending={pendingSets.mixed}
      discard={pendingImportById('p-up-live')}
    />
  ),
  'discard-unusable-draft': () => (
    <Step
      accounts={importableAccounts}
      pending={pendingSets.withUnusable}
      discard={pendingImportById('p-anz-old')}
    />
  ),
};
