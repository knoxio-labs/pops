import { Badge } from '@pops/ui';

import { workspaceAttentionModel } from './workspace-attention-model';

import type { JSX } from 'react';

import type { OverviewViewProps } from './types';
import type { WorkspaceAttentionItem } from './workspace-attention-model';

/** Show only route gaps, proven open nights and incomplete recorded visit dates. */
export function WorkspaceAttention(props: OverviewViewProps): JSX.Element {
  const { items, hasVisits } = workspaceAttentionModel(props);
  return (
    <section
      aria-label={props.labels.status('workspace.beforeYouGo')}
      className="min-w-0 rounded-2xl border border-trip-line bg-trip-surface p-4 sm:p-5"
    >
      <AttentionHeading {...props} count={items.reduce((total, item) => total + item.count, 0)} />
      {items.length ? (
        <AttentionItems items={items} />
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-trip-muted">
          {props.labels.status('workspace.noRecordedGaps')}
        </p>
      )}
      {hasVisits && (
        <p className="mt-4 border-t border-trip-line pt-3 text-xs leading-relaxed text-trip-muted">
          {props.labels.status('workspace.unknownDatesStayUnknown')}
        </p>
      )}
    </section>
  );
}

function AttentionHeading(props: OverviewViewProps & { count: number }): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-trip-muted">
          {props.labels.status('workspace.beforeYouGo')}
        </p>
        <h2 className="mt-1 font-trip-display text-xl font-semibold">
          {props.labels.status('workspace.tripCheck')}
        </h2>
      </div>
      {props.count > 0 && (
        <Badge className="border-trip-attention bg-trip-attention-soft text-trip-attention">
          {props.count}
        </Badge>
      )}
    </div>
  );
}

function AttentionItems({ items }: { items: WorkspaceAttentionItem[] }): JSX.Element {
  return (
    <ul className="mt-4 space-y-3">
      {items.map((item) => (
        <li key={item.key} className="flex min-w-0 gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-trip-attention-soft text-trip-attention">
            <item.icon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium leading-snug">{item.title}</p>
            <p className="mt-1 break-words text-xs leading-relaxed text-trip-muted">
              {item.detail}
            </p>
          </div>
          <span className="shrink-0 self-start font-trip-data text-xs tabular-nums text-trip-muted">
            {item.count}
          </span>
        </li>
      ))}
    </ul>
  );
}
