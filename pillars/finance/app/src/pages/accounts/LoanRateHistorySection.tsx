import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge, Button, DateInput, Label, NumberInput } from '@pops/ui';

import { unwrap } from '../../finance-api-helpers.js';
import { loanListRateHistory, loanRecordRate } from '../../finance-api/index.js';

type RateEntry = { id: string; annualRatePct: number; effectiveFrom: string; source: string };

const rateHistoryKey = (accountId: string) =>
  ['finance', 'accounts', accountId, 'loan-rate-history'] as const;

function useRateHistory(accountId: string) {
  return useQuery({
    queryKey: rateHistoryKey(accountId),
    queryFn: async () => unwrap(await loanListRateHistory({ path: { id: accountId } })).data,
  });
}

function RateRow({ entry }: { entry: RateEntry }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-2 text-sm">
      <span className="font-medium tabular-nums">{entry.annualRatePct}%</span>
      <span className="text-xs text-muted-foreground">from {entry.effectiveFrom}</span>
      <Badge variant={entry.source === 'manual' ? 'secondary' : 'outline'} className="text-[10px]">
        {entry.source}
      </Badge>
    </div>
  );
}

function useRecordRate(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { annualRatePct: number; effectiveFrom: string }) =>
      unwrap(
        await loanRecordRate({
          path: { id: accountId },
          body: { annualRatePct: input.annualRatePct, effectiveFrom: input.effectiveFrom },
        })
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rateHistoryKey(accountId) }),
  });
}

function RecordRateForm({ accountId, onDone }: { accountId: string; onDone: () => void }) {
  const [rate, setRate] = useState<number | ''>('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const record = useRecordRate(accountId);
  const canSave = rate !== '' && effectiveFrom !== '';

  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rate-new-value">New rate</Label>
          <NumberInput
            id="rate-new-value"
            suffix="%"
            value={rate}
            onChange={(e) => {
              const next = e.currentTarget.value;
              setRate(next === '' ? '' : Number(next));
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rate-effective-from">Effective from</Label>
          <DateInput
            id="rate-effective-from"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.currentTarget.value)}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canSave || record.isPending}
          onClick={() => {
            if (rate === '') return;
            record.mutate({ annualRatePct: rate, effectiveFrom }, { onSuccess: onDone });
          }}
        >
          Record rate
        </Button>
      </div>
      {record.isError && (
        <p className="text-xs text-destructive">
          {record.error instanceof Error ? record.error.message : 'Failed to record the rate'}
        </p>
      )}
    </div>
  );
}

/**
 * Every rate a loan account has carried, newest first (`listRateHistory`),
 * with a "record rate change" action for `recordRate`. Only shown once a
 * loan account already has terms — recording a rate ahead of the terms that
 * anchor it has nothing to attach to.
 */
export function LoanRateHistorySection({ accountId }: { accountId: string }) {
  const [recording, setRecording] = useState(false);
  const history = useRateHistory(accountId);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Rate history</Label>
        {!recording && (
          <Button type="button" variant="outline" size="sm" onClick={() => setRecording(true)}>
            Record rate change
          </Button>
        )}
      </div>
      {recording && <RecordRateForm accountId={accountId} onDone={() => setRecording(false)} />}
      {history.data?.length === 0 && (
        <p className="text-xs text-muted-foreground">No rate recorded yet.</p>
      )}
      {history.data && history.data.length > 0 && (
        <div className="space-y-1.5">
          {history.data.map((entry) => (
            <RateRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
