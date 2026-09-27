import { Skeleton, cn } from '@pops/ui';

import type { ReactNode } from 'react';

/** A bordered report panel whose contents can scroll without moving the page. */
export function ReportPanel({
  title,
  aside,
  children,
  className,
}: {
  readonly title: string;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}): ReactNode {
  return (
    <section
      aria-label={title}
      className={cn('flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card', className)}
    >
      <header className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-b px-4">
        <h2 className="text-sm font-medium">{title}</h2>
        {aside}
      </header>
      <div className="relative min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

/** Renders a bounded horizontal bar for a server-provided 0-to-1 share. */
export function ShareBar({ share, className }: { share: number; className?: string }): ReactNode {
  const percent = Math.max(0, Math.min(1, share)) * 100;
  return (
    <span
      className={cn('block h-1.5 overflow-hidden rounded-full bg-muted', className)}
      aria-hidden
    >
      <span className="block h-full rounded-full bg-app-accent" style={{ width: `${percent}%` }} />
    </span>
  );
}

/** Shows compact skeleton rows while a report query is pending. */
export function ReportSkeletonRows({ count = 6 }: { count?: number }): ReactNode {
  return (
    <div aria-busy="true" className="space-y-2 p-4">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={`report-row-${String(index)}`} className="h-7 w-full" />
      ))}
    </div>
  );
}
