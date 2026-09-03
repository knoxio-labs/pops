import { CheckCircle2, CopyCheck, Info } from 'lucide-react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
} from '@pops/ui';

import { accountById, choiceOf, type ImportChoice } from './context';
import { ImportContextStrip } from './upload';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Commit', order: 4, frame: 'web' };

interface Tally {
  parsed: number;
  duplicates: number;
  /** Transactions already filed against this account before the import. */
  prior: number;
  range: string;
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <Card className="flex-1">
      <CardContent className="px-4 py-3">
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function Figures({ tally }: { tally: Tally }) {
  return (
    <div className="flex flex-wrap gap-3">
      <Figure value={String(tally.parsed)} label="rows in the file" />
      <Figure value={String(tally.parsed - tally.duplicates)} label="new transactions" />
      <Figure value={String(tally.duplicates)} label="duplicates skipped" />
    </div>
  );
}

/**
 * Why the duplicate count is what it is. The dedup key is scoped to the
 * account (POPS-2773), so the same charge appearing on a second account is
 * two transactions and not a duplicate — a number that used to be global and
 * now is not has to say which it is.
 */
function DedupNote({ choice, tally }: { choice: ImportChoice; tally: Tally }) {
  if (tally.prior === 0) {
    return (
      <Alert>
        <Info aria-hidden />
        <AlertTitle>First import for {choice.account.name}</AlertTitle>
        <AlertDescription>
          There is nothing on this account to compare against, so every row is new. Duplicates start
          being skipped from the next import.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert>
      <CopyCheck aria-hidden />
      <AlertTitle>
        {tally.duplicates} already on {choice.account.name}
      </AlertTitle>
      <AlertDescription>
        Matched against the {tally.prior.toLocaleString('en-AU')} transactions already filed against
        this account — and only this one. The same charge on another account is a separate
        transaction, not a duplicate.
      </AlertDescription>
    </Alert>
  );
}

function Step({ choice, tally }: { choice: ImportChoice; tally: Tally }) {
  const fresh = tally.parsed - tally.duplicates;
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <PageHeader
        title="Commit the import"
        description={`${tally.range} · nothing is written until you commit.`}
        actions={<Button disabled={fresh === 0}>Commit {fresh} transactions</Button>}
      />
      <ImportContextStrip choice={choice} editable={false} />
      <Figures tally={tally} />
      <DedupNote choice={choice} tally={tally} />
      {fresh === 0 && (
        <p className="text-sm text-muted-foreground">
          Every row in this file is already on {choice.account.name}. There is nothing to commit —
          go back if you meant to import a different export.
        </p>
      )}
    </div>
  );
}

const AMEX = choiceOf('a2', 'amex-csv');

const DEFAULT_TALLY: Tally = {
  parsed: 8,
  duplicates: 2,
  prior: 499,
  range: '24 Aug – 28 Aug 2026',
};

const FIRST: ImportChoice = {
  ...choiceOf('a4', 'anz-csv'),
  account: { ...accountById('a4'), transactionCount: 0 },
};

export default function ImportCommitStep() {
  return <Step choice={AMEX} tally={DEFAULT_TALLY} />;
}

export const states: ScreenStates = {
  'first-import': () => (
    <Step
      choice={FIRST}
      tally={{ parsed: 214, duplicates: 0, prior: 0, range: '1 Jul 2024 – 28 Aug 2026' }}
    />
  ),
  'all-duplicates': () => (
    <Step choice={AMEX} tally={{ ...DEFAULT_TALLY, duplicates: DEFAULT_TALLY.parsed }} />
  ),
  committed: () => (
    <div className="mx-auto max-w-2xl p-6">
      <EmptyState
        icon={CheckCircle2}
        title="6 transactions added to Amex"
        description="2 rows were already there and were skipped. The import is on the account's history if you need to undo it."
        action={<Button variant="outline">Open Amex</Button>}
      />
    </div>
  ),
};
