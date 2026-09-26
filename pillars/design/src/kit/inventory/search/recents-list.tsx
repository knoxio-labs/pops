/**
 * What search shows before anything is typed: the last queries run and the
 * records last opened. Recents replace saved searches (owner decision 6);
 * a filtered view that matters is a bookmarked URL.
 */
import { Clock, Search } from 'lucide-react';

import { ButtonPrimitive } from '@pops/ui';

import { ResultHeading } from './result-rows';

import type { PaletteCommand } from '../foundation';

/** Props for {@link RecentsList}. */
export interface RecentsListProps {
  queries: readonly string[];
  records: readonly PaletteCommand[];
  activeId?: string;
}

/** Recent queries and records. */
export function RecentsList({ queries, records, activeId }: RecentsListProps) {
  return (
    <div
      role="listbox"
      aria-label="Recent"
      tabIndex={0}
      className="relative min-h-0 flex-1 overflow-y-auto outline-none"
    >
      <ResultHeading title="Recent searches" count={queries.length} />
      <div className="flex flex-wrap gap-1.5 p-3">
        {queries.map((query) => (
          <ButtonPrimitive
            key={query}
            variant="outline"
            size="xs"
            className="h-7 gap-1.5 rounded-full px-3 text-xs"
          >
            <Search className="size-3 text-muted-foreground" aria-hidden />
            {query}
          </ButtonPrimitive>
        ))}
      </div>
      <ResultHeading title="Recently opened" count={records.length} />
      <div className="divide-y divide-border/60">
        {records.map((record) => {
          const Icon = record.icon;
          return (
            <div
              key={record.id}
              role="option"
              aria-selected={activeId === record.id}
              className={
                activeId === record.id
                  ? 'flex h-12 items-center gap-3 border-l-2 border-l-app-accent bg-muted px-3'
                  : 'flex h-12 items-center gap-3 border-l-2 border-l-transparent px-3 hover:bg-muted/60'
              }
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{record.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {record.detail}
                </span>
              </span>
              <Clock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </div>
          );
        })}
      </div>
    </div>
  );
}
