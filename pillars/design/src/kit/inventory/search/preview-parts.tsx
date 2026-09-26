/**
 * The preview pane's frame: a header (mark, title, badges, where it is),
 * the verbs, and one list that scrolls inside the pane when it is long.
 */
import { CodeBadge, ItemMark, QuantityBadge } from '../foundation';

import type { ReactNode } from 'react';

import type { ItemRowModel } from '../foundation';

/** The pane's frame. */
export function PreviewFrame({
  mark,
  title,
  badges,
  where,
  actions,
  children,
}: {
  mark: ReactNode;
  title: string;
  badges?: ReactNode;
  where: ReactNode;
  actions: ReactNode;
  children: ReactNode;
}) {
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

/** A titled list inside the pane; the list scrolls, the title does not. */
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
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <h3 className="flex items-center justify-between text-2xs font-semibold tracking-label text-muted-foreground uppercase">
        {title}
        <span className="tabular-nums">{count}</span>
      </h3>
      {count === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="relative min-h-0 divide-y divide-border/60 overflow-y-auto rounded-lg border">
          {children}
        </ul>
      )}
    </div>
  );
}

/** One item inside a previewed container or place. */
export function PreviewRow({ item }: { item: ItemRowModel }) {
  return (
    <li className="flex h-10 items-center gap-3 px-3 text-sm">
      <ItemMark item={item} />
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      <QuantityBadge quantity={item.quantity} />
      <CodeBadge code={item.code} />
    </li>
  );
}

/** One fact in the preview, label left and value right. */
export function PreviewFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-3 px-3 py-2 text-sm">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}
