/**
 * The frame every list page in this unit sits in (Items, Containers, Search,
 * Bulk entry, Import): the accent-tiled page header, an optional banner, a
 * toolbar, then a body that takes the rest of the viewport. The page never
 * scrolls; only the list inside the body does, and the selection bar docks
 * under it.
 */
import { PageHeader, cn } from '@pops/ui';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** The amber tile the page header carries on every inventory page. */
export function PageTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-app-accent/15">
      <Icon className="size-5 text-app-accent" aria-hidden />
    </span>
  );
}

/** Props for {@link ListPage}. */
export interface ListPageProps {
  title: string;
  icon: LucideIcon;
  description?: ReactNode;
  actions?: ReactNode;
  /** One state banner at most: stale, offline, type arrived, duplicates. */
  banner?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  /** Docked under the body: the selection bar. */
  dock?: ReactNode;
  /** Drawn over the page: a sheet, the palette, the search dropdown. */
  overlay?: ReactNode;
  className?: string;
}

/** Fills the content area exactly, so nothing but the body's list can scroll. */
export const VIEWPORT_HEIGHT =
  'h-[calc(100dvh-5.5rem)] md:h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-8rem)]';

/** A list page. */
export function ListPage({
  title,
  icon,
  description,
  actions,
  banner,
  toolbar,
  children,
  dock,
  overlay,
  className,
}: ListPageProps) {
  return (
    <div className={cn('flex min-h-0 flex-col gap-3', VIEWPORT_HEIGHT, className)}>
      <PageHeader
        title={title}
        description={description}
        icon={<PageTile icon={icon} />}
        actions={actions}
      />
      {banner}
      {toolbar}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {dock}
      {overlay}
    </div>
  );
}

/** The scrolling box a list body lives in: bordered, carded, the only scroller on the page. */
export function ListBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn('relative min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card', className)}
      data-list-body
    >
      {children}
    </div>
  );
}
