import { Button } from '@pops/ui';

import type { ProposalOutcome } from '@/fixtures/purchases-dictionary';
import type { ReactElement } from 'react';

interface ProposalPassPanelProps {
  isPending: boolean;
  outcome: ProposalOutcome | null;
  error: string | null;
  onRun: () => void;
}

const OUTCOME_FIELDS: readonly { field: keyof ProposalOutcome; label: string }[] = [
  { field: 'scannedLines', label: 'Lines read' },
  { field: 'observedWordings', label: 'Distinct wordings' },
  { field: 'proposed', label: 'Entries minted' },
  { field: 'retired', label: 'Entries retired' },
  { field: 'confirmed', label: 'Left alone as asserted' },
];

/**
 * Running the pass, and reading what it did.
 *
 * Every figure is shown, `retired` included: a pass takes back the
 * unconfirmed entries no line prints any more, so a run can remove a
 * proposal the reader was about to act on, and a panel reporting only what
 * was minted would let that happen invisibly.
 */
export function ProposalPassPanel({
  isPending,
  outcome,
  error,
  onRun,
}: ProposalPassPanelProps): ReactElement {
  return (
    <section
      aria-label="The proposal pass"
      className="border-border space-y-3 rounded-md border p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium">The proposal pass</h2>
        <Button size="sm" disabled={isPending} onClick={onRun}>
          {isPending ? 'Running…' : 'Run the pass'}
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">
        Reads every stored line, mints an entry for each printed wording that has none, and retires
        the unasserted entries no line prints any more. A wording somebody asserted is left alone,
        and so are the wordings reaching a product somebody named. Nothing runs this on a schedule:
        it runs when you press the button.
      </p>

      <div aria-live="polite">
        {error !== null && (
          <p className="text-destructive text-sm">The pass did not run: {error}</p>
        )}
        {outcome !== null && error === null && (
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {OUTCOME_FIELDS.map(({ field, label }) => (
              <div key={field}>
                <dt className="text-muted-foreground text-xs">{label}</dt>
                <dd className="text-sm tabular-nums">{outcome[field]}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
