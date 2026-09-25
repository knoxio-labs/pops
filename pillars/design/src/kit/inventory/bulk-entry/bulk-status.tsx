/**
 * What bulk entry says above the grid in each phase, and the bar under it
 * that carries the count and the one button. The button always states the
 * outcome: how many will be created and how many will stay to fix.
 */
import { CircleCheck, ClipboardPaste, ListChecks } from 'lucide-react';

import { Button, Progress, cn } from '@pops/ui';

import { INVENTORY_ICONS, KeyCombo } from '../foundation';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Bulk entry's phases (owner decision 3: partial accept, no all-or-nothing failure). */
export type BulkPhase =
  | 'editing'
  | 'pasted'
  | 'validating'
  | 'has-errors'
  | 'submitting'
  | 'partial-created'
  | 'created';

/** The counts every phase reports. */
export interface BulkCounts {
  rows: number;
  ready: number;
  refused: number;
  created: number;
}

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
}) {
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

const ICON_TONE = {
  accent: 'text-app-accent',
  warning: 'text-warning',
  quiet: 'text-muted-foreground',
} as const;

/** "1 row", "3 rows". */
export const plural = (count: number, noun: string) =>
  `${String(count)} ${noun}${count === 1 ? '' : 's'}`;

interface BannerProps {
  phase: BulkPhase;
  counts: BulkCounts;
  pasteNote: string;
  destination: string;
}

function OutcomeBanner({ phase, counts, destination }: BannerProps) {
  const Label = INVENTORY_ICONS.label;
  switch (phase) {
    case 'has-errors':
      return (
        <Banner
          icon={INVENTORY_ICONS.needsAttention}
          tone="warning"
          title={`${plural(counts.refused, 'row')} need fixing`}
          detail={`Create now and the ${String(counts.ready)} ready rows are added; the ${String(counts.refused)} stay here with their reasons.`}
        />
      );
    case 'partial-created':
      return (
        <Banner
          icon={CircleCheck}
          tone="accent"
          title={`Created ${plural(counts.created, 'item')}. ${plural(counts.refused, 'row')} left to fix`}
          detail="Fix the rows below and create again. The created items are already in Items."
        >
          <Button size="sm" variant="ghost">
            Undo
          </Button>
          <Button size="sm" variant="outline" className="bg-background">
            Show the {counts.created} in Items
          </Button>
        </Banner>
      );
    case 'created':
      return (
        <Banner
          icon={CircleCheck}
          tone="accent"
          title={`Created ${plural(counts.created, 'item')}`}
          detail={`Each went where its row said, or to ${destination}.`}
        >
          <Button size="sm" variant="ghost">
            Undo
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="bg-background"
            prefix={<Label className="size-4" aria-hidden />}
          >
            Print {counts.created} labels
          </Button>
          <Button size="sm" variant="outline" className="bg-background">
            Show in Items
          </Button>
        </Banner>
      );
    default:
      return null;
  }
}

/** The banner for a phase. */
export function BulkBanner(props: BannerProps) {
  return <WorkingBanner {...props} />;
}

function WorkingBanner({ phase, counts, pasteNote, destination }: BannerProps) {
  switch (phase) {
    case 'editing':
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
    case 'pasted':
      return (
        <Banner
          icon={ClipboardPaste}
          tone="accent"
          title={`Pasted ${plural(counts.rows, 'row')}`}
          detail={pasteNote}
        />
      );
    case 'validating':
      return (
        <Banner
          icon={ListChecks}
          tone="quiet"
          title={`Checking ${plural(counts.rows, 'row')} against existing codes, types and places`}
        >
          <Progress value={60} className="w-40" aria-label="Checking rows" />
        </Banner>
      );
    case 'submitting':
      return (
        <Banner
          icon={ListChecks}
          tone="quiet"
          title={`Creating ${plural(counts.ready, 'item')} in ${destination}`}
        >
          <Progress value={45} className="w-40" aria-label="Creating items" />
        </Banner>
      );
    default:
      return (
        <OutcomeBanner
          phase={phase}
          counts={counts}
          pasteNote={pasteNote}
          destination={destination}
        />
      );
  }
}
