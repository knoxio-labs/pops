/**
 * The frame the connections, fixtures, reports and settings pages share: a
 * page header with the accent tile, an optional tab row, an optional state
 * banner, and a body that takes the rest of the viewport. The page itself
 * never scrolls; whatever list sits in the body scrolls inside it.
 */
import { PageHeader, Tabs, TabsList, TabsTrigger, cn } from '@pops/ui';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** The accent tile every inventory page header carries. */
export function AccentTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-app-accent/15">
      <Icon className="size-5 text-app-accent" aria-hidden />
    </span>
  );
}

/** Props for {@link InventoryPage}. */
export interface InventoryPageProps {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** A back link and trail, for pages under another. */
  breadcrumbs?: { label: string; href?: string }[];
  tabs?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A full-height inventory page. */
export function InventoryPage(props: InventoryPageProps) {
  return (
    <div
      className={cn(
        'flex h-[calc(100dvh-5.5rem)] min-h-[34rem] flex-col gap-4 md:h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-8rem)]',
        props.className
      )}
    >
      <PageHeader
        title={props.title}
        description={props.description}
        icon={<AccentTile icon={props.icon} />}
        actions={props.actions}
        breadcrumbs={props.breadcrumbs}
        backHref={props.breadcrumbs?.at(-2)?.href}
      />
      {props.tabs}
      {props.banner}
      <div className="flex min-h-0 flex-1 flex-col">{props.children}</div>
    </div>
  );
}

/** One tab of {@link PageTabs}. */
export interface PageTab<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** The segment row under a page header: routes that share one page. */
export function PageTabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: readonly PageTab<T>[];
  value: T;
  onChange?: (value: T) => void;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        const found = tabs.find((tab) => tab.value === next);
        if (found) onChange?.(found.value);
      }}
    >
      <TabsList aria-label={label} className="self-start">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="flex-none gap-1.5 px-3">
            {tab.label}
            {tab.count === undefined ? null : (
              <span className="text-xs tabular-nums text-muted-foreground">{tab.count}</span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/** A bordered panel whose body scrolls, with an optional fixed header row and footer. */
export function ScrollPanel({
  header,
  footer,
  children,
  className,
  label,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card',
        className
      )}
    >
      {header}
      <div className="relative min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer}
    </section>
  );
}
