import { ArrowRight } from 'lucide-react';

import { Button, Card, cn } from '@pops/ui';

import type { LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

/** Props for the shared Overview panel shell. */
export interface OverviewPanelProps {
  title: string;
  icon: LucideIcon;
  count?: number;
  linkLabel: string;
  onLink?: () => void;
  empty?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Renders a titled card whose list owns its scrolling area. */
export function OverviewPanel({
  title,
  icon: Icon,
  count,
  linkLabel,
  onLink,
  empty,
  children,
  className,
}: OverviewPanelProps): ReactElement {
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

/** Renders the one-line empty state shared by Overview panels. */
export function PanelEmpty({ children }: { children: ReactNode }): ReactElement {
  return (
    <p className="flex flex-1 items-center justify-center px-6 py-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/** Renders a compact two-line panel row with an optional verb group. */
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
}): ReactElement {
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
