/**
 * The frame U1's pages share: the page header with the amber tile, an
 * optional banner, and a body sized to the viewport so the page never
 * scrolls and only its lists do (owner rule: compact, lists scroll).
 */
import { Button, Card, PageHeader, cn } from '@pops/ui';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Props for {@link InventoryPage}. */
export interface InventoryPageProps {
  title: string;
  icon: LucideIcon;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  /** A state banner above the body. */
  banner?: ReactNode;
  children: ReactNode;
  /** Floating layers: a docked selection bar, a toast. */
  overlay?: ReactNode;
  className?: string;
}

/** The amber tile the inventory page headers carry. */
export function AccentTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-app-accent/15">
      <Icon className="size-5 text-app-accent" aria-hidden />
    </span>
  );
}

/** One U1 page: header, banner, a body that fills what is left of the viewport. */
export function InventoryPage({
  title,
  icon,
  description,
  actions,
  breadcrumbs,
  banner,
  children,
  overlay,
  className,
}: InventoryPageProps) {
  return (
    <div className="relative flex flex-col gap-4 md:h-[calc(100vh-7rem)] lg:h-[calc(100vh-8rem)]">
      <PageHeader
        title={title}
        description={description}
        icon={<AccentTile icon={icon} />}
        actions={actions}
        breadcrumbs={breadcrumbs}
      />
      {banner}
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>{children}</div>
      {overlay}
    </div>
  );
}

/** Where a page's floating layer sits: bottom right, above the body. */
export function ToastDock({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute right-0 bottom-0 z-20 [&>*]:pointer-events-auto">
      {children}
    </div>
  );
}

/** A body that failed to load: what failed, that nothing changed, and Retry. */
export function LoadError({ title, detail }: { title: string; detail: string }) {
  return (
    <Card
      role="alert"
      className="mx-auto mt-6 w-full max-w-md items-center gap-3 px-6 py-8 text-center"
    >
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{detail}</p>
      <Button size="sm" variant="outline">
        Retry
      </Button>
    </Card>
  );
}
