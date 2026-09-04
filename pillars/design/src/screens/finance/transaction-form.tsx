import { type TransactionType } from '@/kit/transaction-model';
import { FormBody, type Opening, useDraft } from '@/kit/transaction-sections';

import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Transaction form', order: 7, frame: 'web' };

function title(opening: Opening, type: TransactionType): string {
  if (opening.editing) return 'Edit transaction';
  if (type === 'transfer') return 'Add transfer';
  return 'Add transaction';
}

function TransactionForm(opening: Opening) {
  const f = useDraft(opening);
  return (
    <Dialog open>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title(opening, f.draft.type)}</DialogTitle>
        </DialogHeader>
        <FormBody opening={opening} f={f} />
        <DialogFooter className="sm:justify-between">
          {opening.editing ? (
            <Button variant="ghost" className="text-destructive">
              Delete
            </Button>
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <Button variant="outline">Cancel</Button>
            <Button>{opening.editing ? 'Save changes' : 'Add'}</Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const states: ScreenStates = {
  'from-account': () => (
    <TransactionForm
      accountId="a1"
      fixed="from"
      fixedReason="Opened from Everyday, so this is the account it comes out of."
    />
  ),
  'settle-up': () => (
    <TransactionForm
      type="transfer"
      toAccountId="a7"
      fixed="to"
      fixedReason="Marta's ledger reads −$64.00; this clears it."
      amount="64.00"
      description="Settling up with Marta"
    />
  ),
  transfer: () => (
    <TransactionForm type="transfer" accountId="a1" toAccountId="a2" amount="500.00" />
  ),
  edit: () => (
    <TransactionForm
      editing
      accountId="a2"
      amount="84.32"
      date="2026-08-28"
      description="WOOLWORTHS 1234 NEWTOWN"
      entity="Woolworths"
      tags={['groceries']}
    />
  ),
  validation: () => <TransactionForm submitted date="2026-12-24" amount="0" />,
};

export default function TransactionFormScreen() {
  return <TransactionForm />;
}
