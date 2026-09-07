import { LINK_TYPE_LABELS } from '@/kit/purchases/labels';

import { cn, formatCents, formatDate } from '@pops/ui';

import { deltaState } from './money';

import type { ProposedLink, QueueEntry } from '@/fixtures/purchases-queue';
import type { ReactElement } from 'react';

export function entryDomId(chargeId: string): string {
  return `reconcile-entry-${chargeId}`;
}

interface QueueEntryRowProps {
  entry: QueueEntry;
  isActive: boolean;
  onSelect: (entry: QueueEntry) => void;
}

/**
 * One decision, laid out as the inbox reads it: the charge on the left, what
 * the engine proposes on the right, the arithmetic between them in the
 * middle.
 *
 * Nothing inside is focusable. The list owns the keyboard as a single
 * listbox, and interactive children inside a `role="option"` would take
 * focus away from it and break `j`/`k` after the first click.
 */
export function QueueEntryRow({ entry, isActive, onSelect }: QueueEntryRowProps): ReactElement {
  return (
    <li
      role="option"
      id={entryDomId(entry.chargeId)}
      aria-selected={isActive}
      data-charge-id={entry.chargeId}
      onClick={() => onSelect(entry)}
      className={cn(
        'grid cursor-pointer gap-4 rounded-md border p-4 md:grid-cols-6',
        isActive ? 'border-primary bg-accent/40' : 'border-border'
      )}
    >
      <ChargeSummary entry={entry} />
      <DeltaCell entry={entry} />
      <section aria-label="Proposed transactions" className="space-y-2 md:col-span-3">
        {entry.proposed.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing proposed — this charge is unexplained.
          </p>
        ) : (
          entry.proposed.map((link) => (
            <ProposalLine key={link.transactionUri} link={link} currency={entry.currency} />
          ))
        )}
      </section>
    </li>
  );
}

function ChargeSummary({ entry }: { entry: QueueEntry }): ReactElement {
  return (
    <section aria-label="Charge" className="space-y-1 md:col-span-2">
      <p className="font-medium">
        {entry.merchantEntityName ?? `Unnamed merchant (${entry.source})`}
      </p>
      <p className="text-xs text-muted-foreground">
        {entry.sourceOrderId ?? 'No order reference'} · {formatDate(entry.orderedAt)}
      </p>
      <p className="text-lg tabular-nums">{formatCents(entry.amountCents, entry.currency)}</p>
    </section>
  );
}

const DELTA_TONE = {
  balanced: 'text-success',
  short: 'text-warning',
  over: 'text-destructive',
} as const;

const DELTA_LABEL = {
  balanced: 'Balanced',
  short: 'Short of the charge',
  over: 'Over-linked',
} as const;

function DeltaCell({ entry }: { entry: QueueEntry }): ReactElement {
  const state = deltaState(entry.deltaCents);
  const hasProposals = entry.proposed.length > 0;

  return (
    <section
      aria-label="Amount difference"
      data-delta-state={hasProposals ? state : 'unexplained'}
      className="flex flex-col justify-center text-sm md:items-center"
    >
      {hasProposals && (
        <>
          <span className={cn('font-medium tabular-nums', DELTA_TONE[state])}>
            {formatCents(entry.deltaCents, entry.currency)}
          </span>
          <span className="text-xs text-muted-foreground">{DELTA_LABEL[state]}</span>
        </>
      )}
    </section>
  );
}

interface ProposalLineProps {
  link: ProposedLink;
  currency: string;
}

function ProposalLine({ link, currency }: ProposalLineProps): ReactElement {
  return (
    <div data-link-type={link.linkType} className="rounded border border-dashed px-3 py-2 text-sm">
      <p className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="tabular-nums">{formatCents(link.amountCents, currency)}</span>
        <span className="text-xs text-muted-foreground">
          {LINK_TYPE_LABELS[link.linkType]} · {Math.round(link.confidence * 100)}% confident
        </span>
      </p>
      <p className="truncate font-mono text-xs text-muted-foreground">{link.transactionUri}</p>
    </div>
  );
}
