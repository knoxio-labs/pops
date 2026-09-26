/**
 * The frame every inventory page sits in: the POPS page header with the
 * amber accent tile, then optional segments, banner and toolbar, then a body
 * sized to what is left of the viewport. The page never scrolls; only the
 * lists inside the body do (owner rule: compact, lists scroll).
 */
import { PageHeader, cn } from '@pops/ui';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { BreadcrumbSegment } from '@pops/ui';

const PAGE_HEIGHT = 'h-[calc(100dvh-5.5rem)] md:h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-8rem)]';

/** The amber tile a page title carries; `lg` for a record's own header. */
export function AccentTile({ icon: Icon, size = 'md' }: { icon: LucideIcon; size?: 'md' | 'lg' }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg bg-app-accent/15',
        size === 'lg' ? 'size-11' : 'size-9'
      )}
    >
      <Icon className="size-5 text-app-accent" aria-hidden />
    </span>
  );
}

/** Props for {@link InventoryPage}. */
export interface InventoryPageProps {
  title: ReactNode;
  icon: LucideIcon;
  description?: ReactNode;
  actions?: ReactNode;
  /** The trail above the title, for a page under another. */
  breadcrumbs?: BreadcrumbSegment[];
  /** A segment row under the header: pages that share one route. */
  tabs?: ReactNode;
  /** One state banner at most: stale, offline, a conflict. */
  banner?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  /** Docked under the body: the selection bar. */
  dock?: ReactNode;
  /** Drawn over the page: a sheet, the palette, a toast. */
  overlay?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** A full-height inventory page. */
export function InventoryPage(props: InventoryPageProps) {
  return (
    <div className={cn('relative flex min-h-120 flex-col gap-4', PAGE_HEIGHT, props.className)}>
      <PageHeader
        title={props.title}
        description={props.description}
        icon={<AccentTile icon={props.icon} />}
        actions={props.actions}
        breadcrumbs={props.breadcrumbs}
      />
      {props.tabs}
      {props.banner}
      {props.toolbar}
      <div className={cn('flex min-h-0 flex-1 flex-col', props.bodyClassName)}>
        {props.children}
      </div>
      {props.dock}
      {props.overlay}
    </div>
  );
}
