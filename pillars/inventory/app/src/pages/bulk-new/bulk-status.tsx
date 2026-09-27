import { CircleCheck, ClipboardPaste, ListChecks } from 'lucide-react';

import { Button, KeyCombo, Progress, cn } from '@pops/ui';

import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { HintTooltip } from '../../foundation/shortcuts/hint-tooltip.js';

import type { LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import type { BatchProgress } from '../../inventory-web/batch-commit.js';
import type { BulkCounts, BulkPhase } from './use-bulk-entry.js';

const ICON_TONE = {
  accent: 'text-app-accent',
  warning: 'text-warning',
  quiet: 'text-muted-foreground',
} as const;

/** Formats a count with its singular or plural noun. */
export const plural = (count: number, noun: string): string =>
  `${String(count)} ${noun}${count === 1 ? '' : 's'}`;

function Banner({
  icon: Icon,
  tone,
  title,
  detail,
  children,
}: {
  icon: LucideIcon;
  tone: 'accent' | 'warning' | 'quiet';
  title: string;
  detail?: ReactNode;
  children?: ReactNode;
}): ReactElement {
  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-2',
        tone === 'accent' && 'border-app-accent/40 bg-app-accent/10',
        tone === 'warning' && 'border-warning/40 bg-warning/10',
        tone === 'quiet' && 'bg-muted/60'
      )}
    >
      <Icon className={cn('size-4 shrink-0', ICON_TONE[tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {detail ? <div className="text-xs text-muted-foreground">{detail}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** Props for the phase banner above the bulk-entry grid. */
export interface BulkBannerProps {
  phase: BulkPhase;
  counts: BulkCounts;
  pasteNote: string;
  destination: string;
  progress: BatchProgress | null;
  onUndo: () => void;
  onShowInItems: () => void;
  onPrintLabels: () => void;
  printDisabledReason?: string;
}

function printButton(
  props: Pick<BulkBannerProps, 'counts' | 'onPrintLabels' | 'printDisabledReason'>
): ReactElement {
  const Label = INVENTORY_ICONS.label;
  const button = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="bg-background"
      prefix={<Label className="size-4" aria-hidden />}
      disabled={props.printDisabledReason !== undefined}
      onClick={props.onPrintLabels}
    >
      Print {props.counts.created} labels
    </Button>
  );
  return props.printDisabledReason === undefined ? (
    button
  ) : (
    <HintTooltip label="Print labels" disabledReason={props.printDisabledReason}>
      {button}
    </HintTooltip>
  );
}

function errorOutcomeBanner(props: BulkBannerProps): ReactElement {
  return (
    <Banner
      icon={INVENTORY_ICONS.needsAttention}
      tone="warning"
      title={`${plural(props.counts.refused, 'row')} need fixing`}
      detail={`Create now and the ${String(props.counts.ready)} ready rows are added; the ${String(props.counts.refused)} stay here with their reasons.`}
    />
  );
}

function partialOutcomeBanner(props: BulkBannerProps): ReactElement {
  return (
    <Banner
      icon={CircleCheck}
      tone="accent"
      title={`Created ${plural(props.counts.created, 'item')}. ${plural(props.counts.refused, 'row')} left to fix`}
      detail="Fix the rows below and create again. The created items are already in Items."
    >
      <Button type="button" size="sm" variant="ghost" onClick={props.onUndo}>
        Undo
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="bg-background"
        onClick={props.onShowInItems}
      >
        Show the {props.counts.created} in Items
      </Button>
    </Banner>
  );
}

function createdOutcomeBanner(props: BulkBannerProps): ReactElement {
  return (
    <Banner
      icon={CircleCheck}
      tone="accent"
      title={`Created ${plural(props.counts.created, 'item')}`}
      detail={`Each went where its row said, or to ${props.destination}.`}
    >
      <Button type="button" size="sm" variant="ghost" onClick={props.onUndo}>
        Undo
      </Button>
      {printButton(props)}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="bg-background"
        onClick={props.onShowInItems}
      >
        Show in Items
      </Button>
    </Banner>
  );
}

function outcomeBanner(props: BulkBannerProps): ReactElement | null {
  if (props.phase === 'has-errors') return errorOutcomeBanner(props);
  if (props.phase === 'partial-created') return partialOutcomeBanner(props);
  if (props.phase === 'created') return createdOutcomeBanner(props);
  return null;
}

/** Renders the working or outcome banner for the current bulk-entry phase. */
export function BulkBanner(props: BulkBannerProps): ReactElement | null {
  const { phase, counts, pasteNote, destination, progress } = props;
  if (phase === 'editing') {
    return (
      <Banner
        icon={ClipboardPaste}
        tone="quiet"
        title="Type a row, or paste rows from a spreadsheet"
        detail={
          <>
            Columns: Name, Type, Qty, Code, Where, Note. A header row is read if there is one.{' '}
            <KeyCombo sequence={['Mod+v']} /> pastes into the grid.
          </>
        }
      />
    );
  }
  if (phase === 'pasted') {
    return (
      <Banner
        icon={ClipboardPaste}
        tone="accent"
        title={`Pasted ${plural(counts.rows, 'row')}`}
        detail={pasteNote}
      />
    );
  }
  if (phase === 'validating') {
    return (
      <Banner
        icon={ListChecks}
        tone="quiet"
        title={`Checking ${plural(counts.rows, 'row')} against existing codes, types and places`}
      />
    );
  }
  if (phase === 'submitting') {
    const value =
      progress === null || progress.total === 0 ? 0 : (100 * progress.sent) / progress.total;
    return (
      <Banner
        icon={ListChecks}
        tone="quiet"
        title={`Creating ${plural(counts.ready, 'item')} in ${destination}`}
      >
        <Progress value={value} className="w-40" aria-label="Creating items" />
      </Banner>
    );
  }
  return outcomeBanner(props);
}
