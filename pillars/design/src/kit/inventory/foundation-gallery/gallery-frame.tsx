/**
 * The frame every foundation gallery state renders in: the page header the
 * inventory pages share, then labelled specimens. A specimen names what it
 * shows in literal words, so a reviewer knows which state is on screen.
 */
import { Shapes } from 'lucide-react';

import { PageHeader, cn } from '@pops/ui';

import { AccentTile } from '../shared/page-frame';

import type { ReactNode } from 'react';

/** The gallery page: header plus the state's specimens. */
export function GalleryPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <PageHeader title={title} description={description} icon={<AccentTile icon={Shapes} />} />
      {children}
    </div>
  );
}

/** One labelled specimen. */
export function Specimen({
  label,
  note,
  children,
  className,
}: {
  label: string;
  note?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={label} className={cn('min-w-0 space-y-2', className)}>
      <header className="flex items-baseline gap-2">
        <h2 className="text-2xs font-semibold uppercase tracking-label text-muted-foreground">
          {label}
        </h2>
        {note ? <p className="truncate text-xs text-muted-foreground">{note}</p> : null}
      </header>
      {children}
    </section>
  );
}

const BACKDROP_ROWS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'];

/** A mock page behind an overlay, so a sheet or palette is seen over something. */
export function Backdrop({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-xl border bg-muted/40', className)}>
      <div aria-hidden className="absolute inset-0 space-y-2 p-4 opacity-60">
        <div className="h-6 w-48 rounded bg-muted" />
        {BACKDROP_ROWS.map((row) => (
          <div key={row} className="h-8 rounded bg-card" />
        ))}
      </div>
      <div aria-hidden className="absolute inset-0 bg-overlay-scrim/30" />
      <div className="relative h-full">{children}</div>
    </div>
  );
}
