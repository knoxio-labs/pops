import { cn } from '@pops/ui';

import { VerbButton } from './verb-button';

import type { LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

/** Height budget used by the detail page so its inner panes own scrolling. */
export const PAGE_HEIGHT = 'md:max-lg:h-[calc(100vh-7rem)] lg:h-[calc(100vh-8rem)]';

/** Props for a one-line empty section. */
export interface EmptyLineProps {
  icon: LucideIcon;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  action?: ReactElement;
  disabledReason?: string;
}

/** Renders a one-line empty section with an optional action. */
export function EmptyLine({
  icon: Icon,
  text,
  actionLabel,
  onAction,
  action,
  disabledReason,
}: EmptyLineProps): ReactElement {
  return (
    <div className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{text}</span>
      {action ??
        (actionLabel ? (
          <VerbButton
            label={actionLabel}
            variant="ghost"
            disabledReason={disabledReason}
            onClick={onAction}
            className="shrink-0 text-foreground"
          />
        ) : null)}
    </div>
  );
}

/** Renders a small section label and optional trailing controls. */
export function PaneLabel({
  children,
  trailing,
  className,
}: {
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div className={cn('flex min-h-6 items-center gap-2', className)}>
      <h2 className="text-2xs font-semibold uppercase tracking-label text-muted-foreground">
        {children}
      </h2>
      {trailing ? <span className="ml-auto flex items-center gap-1">{trailing}</span> : null}
    </div>
  );
}

/** Renders one read-only label/value pair. */
export function ValuePair({ label, value }: { label: string; value: ReactNode }): ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm text-foreground">
        {value ?? <span className="text-muted-foreground">Not recorded</span>}
      </dd>
    </div>
  );
}

const SHORT_DATE = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
});
const DATE_TIME = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  month: 'short',
  hour12: false,
});

/** Formats an ISO timestamp as a local day and abbreviated month. */
export function shortDate(iso: string): string {
  return SHORT_DATE.format(new Date(iso));
}

/** Formats an ISO timestamp as a local day, month, and 24-hour time. */
export function dateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}
