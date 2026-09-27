import { cn } from '@pops/ui';

import type { ReactNode } from 'react';

/** The bordered shell shared by item, place, and purchase previews. */
export function PreviewFrame({
  title,
  subtitle,
  children,
  className,
}: {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section
      aria-label="Search result preview"
      className={cn('flex min-h-0 flex-col gap-4', className)}
    >
      <header className="border-b px-5 py-4">
        <h2 className="truncate text-lg font-semibold">{title}</h2>
        {subtitle !== undefined ? (
          <p className="mt-1 truncate text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-5 pb-5">{children}</div>
    </section>
  );
}

/** A two-column label/value fact used in result previews. */
export function PreviewFact({
  label,
  value,
}: {
  readonly label: string;
  readonly value: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="truncate text-sm">{value}</dd>
    </div>
  );
}

/** A compact action row below the preview heading. */
export function PreviewActions({ children }: { readonly children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

/** A compact list of related records in a preview. */
export function PreviewList({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="mt-5 rounded-lg border bg-muted/20">
      <h3 className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="divide-y">{children}</div>
    </section>
  );
}
