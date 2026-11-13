import { tripPlaceName } from '@/fixtures/trip-places';
import { CalendarDays, FileText, MoreHorizontal, Plus } from 'lucide-react';

import { Button, DropdownMenu, PageHeader } from '@pops/ui';

import { visibleCraftRows } from './model';
import { date } from './source-details';

import type { CraftTimeline } from '@/fixtures/trip-timeline-craft';

import type { CraftWorkspace } from './use-workspace';

function TimelineOptions({ workspace }: { workspace: CraftWorkspace }) {
  const { state, toggleIdeas, toggleDates } = workspace;
  return (
    <DropdownMenu
      align="end"
      trigger={
        <Button variant="ghost" size="icon" aria-label="Timeline options">
          <MoreHorizontal className="size-5" aria-hidden />
        </Button>
      }
      items={[
        {
          value: 'ideas',
          label: state.showIdeas ? 'Hide ideas' : 'Show ideas',
          onSelect: toggleIdeas,
        },
        {
          value: 'calendar',
          label: state.calendarOpen ? 'Hide dates' : 'Show dates',
          onSelect: toggleDates,
        },
      ]}
    />
  );
}

function HeaderActions({ workspace }: { workspace: CraftWorkspace }) {
  const { open } = workspace;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Button onClick={() => open({ kind: 'capture' })}>
        <Plus className="size-4" aria-hidden />
        Add to timeline
      </Button>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" onClick={() => open({ kind: 'documents' })}>
          <FileText className="size-4" aria-hidden />
          Documents
        </Button>
        <TimelineOptions workspace={workspace} />
      </div>
    </div>
  );
}

/** Preserve the wrapping PageHeader; Documents and More remain one compact action group. */
export function CraftHeader({
  timeline,
  workspace,
}: {
  timeline: CraftTimeline;
  workspace: CraftWorkspace;
}) {
  return (
    <PageHeader
      title={<span className="break-words">{timeline.title}</span>}
      description={timeline.subtitle}
      backHref="/design/s/trips/overview"
      actions={<HeaderActions workspace={workspace} />}
    />
  );
}

/** View controls expand context in place without opening another product destination. */
export function CraftToolbar({ workspace }: { workspace: CraftWorkspace }) {
  return (
    <div className="mb-7 mt-8 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
      <h2 className="text-sm font-semibold">Timeline</h2>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">
          {workspace.state.showIdeas ? 'Plans & ideas' : 'Ideas hidden'}
        </span>
        <Button
          variant="ghost"
          className="min-h-11 gap-2 px-2 text-sm text-muted-foreground"
          aria-expanded={workspace.state.calendarOpen}
          onClick={workspace.toggleDates}
        >
          <CalendarDays className="size-4" aria-hidden />
          Dates
        </Button>
      </div>
    </div>
  );
}

function summary(row: CraftTimeline['rows'][number]): [string, string] {
  if (row.kind === 'visit')
    return [tripPlaceName(row.placeId), `${date(row.arrival)} → ${date(row.departure)}`];
  return [
    `${tripPlaceName(row.departure.placeId)} → ${tripPlaceName(row.arrival.placeId)}`,
    `${date(row.departure.date)} → ${date(row.arrival.date)}`,
  ];
}

/** The date summary reports supplied endpoints without assigning missing dates. */
export function CraftDateSummary({
  timeline,
  showIdeas,
}: {
  timeline: CraftTimeline;
  showIdeas: boolean;
}) {
  return (
    <section aria-label="Known trip dates" className="mb-8 rounded-xl bg-muted/40 p-5">
      <h3 className="mb-3 font-medium">Dates in this plan</h3>
      <div className="flex flex-wrap gap-x-8 gap-y-4 text-sm">
        {visibleCraftRows(timeline.rows, showIdeas).map((row) => {
          const [title, dates] = summary(row);
          return (
            <div key={row.id} className="min-w-0">
              <p className="text-muted-foreground">{title}</p>
              <p className="mt-1">{dates}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
