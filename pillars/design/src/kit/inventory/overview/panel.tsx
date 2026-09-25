/**
 * The Overview's panel: a titled card whose list scrolls inside it, with a
 * count and one link to the page that holds the whole list.
 */
import { ArrowRight } from 'lucide-react';

import { Button, Card, cn } from '@pops/ui';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Props for {@link OverviewPanel}. */
export interface OverviewPanelProps {
  title: string;
  icon: LucideIcon;
  count?: number;
  /** The link to the full list: "Containers", "In hand", "Activity". */
  linkLabel: string;
  onLink?: () => void;
  /** Shown instead of the list when it has no rows. */
  empty?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** One Overview panel. */
export function OverviewPanel({
  title,
  icon: Icon,
  count,
  linkLabel,
  onLink,
  empty,
  children,
  className,
}: OverviewPanelProps) {
  return (
    <Card className={cn('flex min-h-0 flex-col gap-0 overflow-hidden py-0', className)}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b pr-1.5 pl-4">
        <Icon className="size-4 text-app-accent" aria-hidden />
        <h2 className="text-sm font-semibold">{title}</h2>
        {count === undefined ? null : (
          <span className="text-sm text-muted-foreground tabular-nums">{count}</span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-muted-foreground"
          onClick={onLink}
          suffix={<ArrowRight className="size-3.5" aria-hidden />}
        >
          {linkLabel}
        </Button>
      </header>
      {empty ?? (
        <ul className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">{children}</ul>
      )}
    </Card>
  );
}

/** A panel's empty line: what is true, in one sentence. */
export function PanelEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-1 items-center justify-center px-6 py-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/** One two-line panel row: a mark, a title line, a detail line, and trailing verbs. */
export function PanelRow({
  mark,
  title,
  detail,
  verbs,
}: {
  mark: ReactNode;
  title: ReactNode;
  detail: ReactNode;
  verbs?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50">
      {mark}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 text-sm">{title}</div>
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {detail}
        </div>
      </div>
      {verbs ? <div className="flex shrink-0 items-center gap-0.5">{verbs}</div> : null}
    </li>
  );
}
