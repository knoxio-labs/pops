/**
 * Small parts every item page section shares: the one-line empty row that
 * names what is missing and offers the action that fills it, the muted
 * section label, and the height budget that keeps the page itself still.
 */
import { cn } from '@pops/ui';

import { VerbButton } from './verb-button';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The page fills the web frame's content box exactly (top bar plus page
 * padding), so lists scroll inside it and the page never does. Below md the
 * frame changes shape and the page is allowed to flow.
 */
export const PAGE_HEIGHT = 'md:h-[calc(100vh-7rem)] lg:h-[calc(100vh-8rem)]';

/** A one-line empty section: what is not there, and the one action that adds it. */
export function EmptyLine({
  icon: Icon,
  text,
  actionLabel,
  onAction,
  disabledReason,
}: {
  icon: LucideIcon;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  disabledReason?: string;
}) {
  return (
    <div className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{text}</span>
      {actionLabel ? (
        <VerbButton
          label={actionLabel}
          variant="ghost"
          disabledReason={disabledReason}
          onClick={onAction}
          className="shrink-0 text-foreground"
        />
      ) : null}
    </div>
  );
}

/** The small uppercase label a block inside a pane starts with. */
export function PaneLabel({
  children,
  trailing,
  className,
}: {
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-6 items-center gap-2', className)}>
      <h2 className="text-2xs font-semibold uppercase tracking-label text-muted-foreground">
        {children}
      </h2>
      {trailing ? <span className="ml-auto flex items-center gap-1">{trailing}</span> : null}
    </div>
  );
}

/** A label and value pair for read-only facts such as provenance. */
export function ValuePair({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm text-foreground">
        {value ?? <span className="text-muted-foreground">Not recorded</span>}
      </dd>
    </div>
  );
}

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const TIME = new Intl.DateTimeFormat('en-AU', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

/** A short, fixed date for history rows: "23 Sep". UTC so fixtures render the same anywhere. */
export function shortDate(iso: string): string {
  return DATE.format(new Date(iso));
}

/** Date and time for event detail: "23 Sep, 11:00". */
export function dateTime(iso: string): string {
  return `${DATE.format(new Date(iso))}, ${TIME.format(new Date(iso))}`;
}
