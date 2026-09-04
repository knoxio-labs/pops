import { type AccountInsight } from '@/fixtures/account-insights';
import { formatBalance } from '@/fixtures/currencies';
import { type LoanRateEntry, loanRateHistoryByAccountId } from '@/fixtures/loan-rate-history';
import { useState } from 'react';

import { Badge, Button, Label, TextInput } from '@pops/ui';

import type { Account } from '@/fixtures/accounts';

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function TermsFields({ loan, currency }: { loan: AccountInsight['loan']; currency: string }) {
  const money = (n: number) => (loan ? formatBalance(n, currency) : '');
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextInput
        label="Original principal"
        defaultValue={loan ? money(loan.originalPrincipal) : ''}
      />
      <TextInput label="Annual rate" defaultValue={loan ? `${loan.annualRatePct}%` : ''} />
      <TextInput label="Term" defaultValue={loan ? `${loan.termMonths} months` : ''} />
      <TextInput
        label="Monthly repayment"
        defaultValue={loan ? money(loan.monthlyRepayment) : ''}
      />
      <TextInput label="Started on" type="date" defaultValue={loan?.startedOn ?? ''} />
      <TextInput label="Terms effective from" type="date" defaultValue={loan?.startedOn ?? ''} />
    </div>
  );
}

function RateRow({ entry }: { entry: LoanRateEntry }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium tabular-nums">{entry.annualRatePct}%</span>
        <span className="text-xs text-muted-foreground">from {day(entry.effectiveFrom)}</span>
      </div>
      <Badge variant={entry.source === 'manual' ? 'secondary' : 'outline'} className="text-[10px]">
        {entry.source}
      </Badge>
    </div>
  );
}

function RecordRateForm({ onCancel, onSave }: { onCancel: () => void; onSave: () => void }) {
  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="New rate" placeholder="6.24%" />
        <TextInput label="Effective from" type="date" />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={onSave}>
          Record rate
        </Button>
      </div>
    </div>
  );
}

/**
 * Terms and rate history for a `loan`-kind account (POPS-2846), fixture-backed
 * like `GiftCardSection`. Offset-link management lives in
 * `LoanOffsetLinksSection` (POPS-2863), rendered alongside this one rather
 * than folded in — it has its own picker and its own list.
 */
export function LoanTermsSection({
  account,
  insight,
}: {
  account?: Account;
  insight?: AccountInsight;
}) {
  const [recording, setRecording] = useState(false);
  const history = loanRateHistoryByAccountId[account?.id ?? ''] ?? [];
  return (
    <fieldset className="space-y-4 rounded-md border border-border p-4">
      <legend className="px-1 text-xs font-medium text-muted-foreground">Loan terms</legend>
      <TermsFields loan={insight?.loan} currency={account?.currency ?? 'AUD'} />
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Rate history</Label>
          {!recording && (
            <Button type="button" variant="outline" size="sm" onClick={() => setRecording(true)}>
              Record rate change
            </Button>
          )}
        </div>
        {recording && (
          <RecordRateForm onCancel={() => setRecording(false)} onSave={() => setRecording(false)} />
        )}
        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground">No rate recorded yet.</p>
        ) : (
          <div className="space-y-1.5">
            {history.map((entry) => (
              <RateRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </fieldset>
  );
}
