import { Children, type ReactElement, type ReactNode } from 'react';

import { Button, Skeleton } from '@pops/ui';

import { CodeBadge, QuantityBadge } from '../../foundation/badges/badges.js';
import { ItemMark } from '../../foundation/badges/item-mark.js';

import type { ItemRowModel } from '../../foundation/model/model.js';

type PreviewFrameProps = {
  mark: ReactNode;
  title: string;
  badges?: ReactNode;
  where: ReactNode;
  actions: ReactNode;
  children: ReactNode;
};

type LegacyPreviewFrameProps = {
  title: string;
  children: ReactNode;
};

/**
 * Renders the shared preview frame: mark, title, badges, placement, actions,
 * and a scrollable result area.
 */
export function PreviewFrame(props: PreviewFrameProps): ReactElement;
export function PreviewFrame(props: LegacyPreviewFrameProps): ReactElement;
export function PreviewFrame(props: PreviewFrameProps | LegacyPreviewFrameProps): ReactElement {
  if (!('mark' in props)) {
    return (
      <section aria-label="Search result preview" className="flex min-h-0 flex-col gap-4">
        <header className="border-b px-5 py-4">
          <h2 className="truncate text-lg font-semibold">{props.title}</h2>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-5 pb-5">{props.children}</div>
      </section>
    );
  }

  const { mark, title, badges, where, actions, children } = props;
  return (
    <section aria-label={`Preview of ${title}`} className="flex h-full min-h-0 flex-col gap-4 p-5">
      <header className="flex items-start gap-3">
        {mark}
        <div className="min-w-0 flex-1 space-y-1.5">
          <h2 className="text-lg leading-tight font-semibold">{title}</h2>
          {badges ? <div className="flex flex-wrap items-center gap-1.5">{badges}</div> : null}
          <div>{where}</div>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/** Renders a titled, counted list whose rows scroll independently of its title. */
export function PreviewList({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: ReactNode;
}): ReactElement {
  const hasChildren = Children.count(children) > 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <h3 className="flex items-center justify-between text-2xs font-semibold tracking-label text-muted-foreground uppercase">
        {title}
        <span className="tabular-nums">{count}</span>
      </h3>
      {count === 0 && !hasChildren ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="relative min-h-0 divide-y divide-border/60 overflow-y-auto rounded-lg border">
          {children}
        </ul>
      )}
    </div>
  );
}

/** Renders one item row inside a previewed container or place. */
export function PreviewRow({ item }: { item: ItemRowModel }): ReactElement {
  return (
    <li className="flex h-10 items-center gap-3 px-3 text-sm">
      <ItemMark item={item} />
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      <QuantityBadge quantity={item.quantity} />
      <CodeBadge code={item.code} />
    </li>
  );
}

/** Renders one fact with its label on the left and value on the right. */
export function PreviewFact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="flex min-h-10 items-center gap-3 px-3 py-2 text-sm">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

/** Returns the shared pending, error, or successful rows for a preview list. */
export function renderPreviewListRows({
  status,
  rows,
  refetch,
}: {
  status: 'pending' | 'error' | 'success';
  rows: readonly ItemRowModel[];
  refetch: () => void;
}): ReactNode {
  if (status === 'pending') {
    return Array.from({ length: 3 }, (_, index) => (
      <li key={`skeleton-${String(index)}`} className="h-10">
        <Skeleton className="h-10 w-full rounded-none" />
      </li>
    ));
  }
  if (status === 'error') {
    return (
      <li className="flex min-h-10 items-center justify-between gap-3 px-3 py-2 text-sm">
        <span>This list did not load.</span>
        <Button type="button" size="sm" variant="outline" onClick={refetch}>
          Retry
        </Button>
      </li>
    );
  }
  return rows.map((row) => <PreviewRow key={row.id} item={row} />);
}
