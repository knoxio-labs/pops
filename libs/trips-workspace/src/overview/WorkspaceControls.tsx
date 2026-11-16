import { List, Map, Search } from 'lucide-react';

import { TextInput, cn } from '@pops/ui';

import type { JSX } from 'react';

import type { OverviewDisplay, OverviewFilter, OverviewLabels } from './types';

interface WorkspaceControlsProps {
  labels: OverviewLabels;
  query: string;
  onQueryChange: (value: string) => void;
  display: OverviewDisplay;
  onDisplayChange: (value: OverviewDisplay) => void;
  filter: OverviewFilter;
  onFilterChange: (value: OverviewFilter) => void;
}

/** Search and presentation controls for the selected Trip's route. */
export function WorkspaceControls(props: WorkspaceControlsProps): JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-trip-line bg-trip-surface p-3 sm:flex-row sm:items-center sm:p-4">
      <TextInput
        aria-label={props.labels.status('workspace.search')}
        placeholder={props.labels.status('workspace.searchPlaceholder')}
        prefix={<Search className="size-4" aria-hidden />}
        value={props.query}
        onChange={(event) => props.onQueryChange(event.target.value)}
        containerClassName="min-h-11 rounded-xl border-trip-line bg-trip-canvas"
        className="min-w-0"
      />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <DisplaySelector
          labels={props.labels}
          display={props.display}
          onDisplayChange={props.onDisplayChange}
        />
        <FilterSelector
          labels={props.labels}
          filter={props.filter}
          onFilterChange={props.onFilterChange}
        />
      </div>
    </div>
  );
}

function DisplaySelector({
  labels,
  display,
  onDisplayChange,
}: Pick<WorkspaceControlsProps, 'labels' | 'display' | 'onDisplayChange'>): JSX.Element {
  const displays: { value: OverviewDisplay; icon: typeof List }[] = [
    { value: 'sheet', icon: List },
    { value: 'journey', icon: Map },
  ];
  return (
    <div
      aria-label={labels.status('workspace.display')}
      className="inline-flex min-h-11 items-center rounded-xl border border-trip-line bg-trip-canvas p-1"
      role="group"
    >
      {displays.map(({ value, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={display === value}
          onClick={() => onDisplayChange(value)}
          className={cn(
            'inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trip-transport',
            display === value
              ? 'bg-trip-sunken text-trip-ink'
              : 'text-trip-muted hover:text-trip-ink'
          )}
        >
          <Icon className="size-4" aria-hidden />
          {labels.status(`workspace.${value}`)}
        </button>
      ))}
    </div>
  );
}

function FilterSelector({
  labels,
  filter,
  onFilterChange,
}: Pick<WorkspaceControlsProps, 'labels' | 'filter' | 'onFilterChange'>): JSX.Element {
  const filters: OverviewFilter[] = ['everything', 'needs-attention', 'booked'];
  return (
    <div
      aria-label={labels.status('workspace.filter')}
      className="flex min-w-0 flex-wrap gap-1 rounded-xl bg-trip-canvas p-1"
      role="group"
    >
      {filters.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={filter === value}
          onClick={() => onFilterChange(value)}
          className={cn(
            'min-h-11 rounded-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trip-transport',
            filter === value
              ? 'bg-trip-surface font-medium text-trip-ink shadow-sm'
              : 'text-trip-muted hover:text-trip-ink'
          )}
        >
          {labels.status(`workspace.${value}`)}
        </button>
      ))}
    </div>
  );
}
