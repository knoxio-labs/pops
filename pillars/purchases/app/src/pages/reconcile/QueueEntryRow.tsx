import { useTranslation } from 'react-i18next';

import { cn, formatDate } from '@pops/ui';

import { deltaState, formatCents } from './money.js';

import type { ReactElement } from 'react';

import type { ProposedLink, QueueEntry } from './types.js';

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
 * the engine proposes on the right, the arithmetic between them in the middle.
 *
 * The axes are the shipped queue's, not the ticket's prose. `/reconcile/queue`
 * returns one row per purchase charge with 0..n proposed transactions, so the
 * charge is the stable side and the transactions are the plural one.
 *
 * Nothing inside is focusable. The list owns the keyboard as a single listbox,
 * and interactive children inside a `role="option"` would take focus away from
 * it and break `j`/`k` after the first click.
 */
export function QueueEntryRow({ entry, isActive, onSelect }: QueueEntryRowProps): ReactElement {
  const { t } = useTranslation('purchases');

  return (
    <li
      role="option"
      id={entryDomId(entry.chargeId)}
      aria-selected={isActive}
      data-charge-id={entry.chargeId}
      onClick={() => onSelect(entry)}
      className={cn(
        'grid cursor-pointer gap-4 rounded-md border p-4 md:grid-cols-[2fr_auto_3fr]',
        isActive ? 'border-primary bg-accent/40' : 'border-border'
      )}
    >
      <ChargeSummary entry={entry} />
      <DeltaCell entry={entry} />
      <section aria-label={t('reconcile.entry.proposalsColumn')} className="space-y-2">
        {entry.proposed.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('reconcile.entry.noProposals')}</p>
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
  const { t } = useTranslation('purchases');

  return (
    <section aria-label={t('reconcile.entry.chargeColumn')} className="space-y-1">
      <p className="font-medium">
        {entry.merchantEntityName ?? t('reconcile.entry.unknownMerchant', { source: entry.source })}
      </p>
      <p className="text-muted-foreground text-xs">
        {entry.sourceOrderId ?? t('reconcile.entry.noOrderRef')} · {formatDate(entry.orderedAt)}
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

function DeltaCell({ entry }: { entry: QueueEntry }): ReactElement {
  const { t } = useTranslation('purchases');
  const state = deltaState(entry.deltaCents);
  const hasProposals = entry.proposed.length > 0;

  return (
    <section
      aria-label={t('reconcile.entry.deltaColumn')}
      data-delta-state={hasProposals ? state : 'unexplained'}
      className="flex flex-col justify-center text-sm md:items-center"
    >
      {hasProposals && (
        <>
          <span className={cn('font-medium tabular-nums', DELTA_TONE[state])}>
            {formatCents(entry.deltaCents, entry.currency)}
          </span>
          <span className="text-muted-foreground text-xs">{t(`reconcile.delta.${state}`)}</span>
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
  const { t } = useTranslation('purchases');

  return (
    <div data-link-type={link.linkType} className="rounded border border-dashed px-3 py-2 text-sm">
      <p className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="tabular-nums">{formatCents(link.amountCents, currency)}</span>
        <span className="text-muted-foreground text-xs">
          {t(`reconcile.linkType.${link.linkType}`)} ·{' '}
          {t('reconcile.entry.confidence', { percent: Math.round(link.confidence * 100) })}
        </span>
      </p>
      <p className="text-muted-foreground truncate font-mono text-xs">{link.transactionUri}</p>
    </div>
  );
}
