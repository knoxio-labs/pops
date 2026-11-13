import { CraftThoughtRow } from './arrangement-rows';
import { CraftFeedback } from './feedback';
import { CraftFlightRow } from './flight-row';
import { CraftDateSummary, CraftHeader, CraftToolbar } from './header';
import { visibleCraftRows } from './model';
import { CraftPanels } from './panels';
import { CraftVisitRow } from './rows';
import { CraftSpendingSection } from './spending';
import { useCraftWorkspace } from './use-workspace';

import type {
  CraftFinanceIntent,
  CraftSpendingState,
  CraftTimeline,
} from '@/fixtures/trip-timeline-craft';

import type { CraftWorkspace } from './use-workspace';

function TimelineRow({
  row,
  workspace,
}: {
  row: CraftTimeline['rows'][number];
  workspace: CraftWorkspace;
}) {
  const { state, open } = workspace;
  if (row.kind === 'flight') {
    return <CraftFlightRow flight={row} onOpen={(source) => open({ kind: 'source', source })} />;
  }
  return (
    <CraftVisitRow
      visit={row}
      showIdeas={state.showIdeas}
      addedItems={state.items.filter((item) => item.visitId === row.id).map((item) => item.item)}
      onOpen={(source) => open({ kind: 'source', source })}
      onAddStay={(visit, gap) => open({ kind: 'stay', visitId: visit.id, gap })}
    />
  );
}

function UnplacedThoughts({ workspace }: { workspace: CraftWorkspace }) {
  if (!workspace.state.showIdeas) return null;
  return (
    <>
      {workspace.state.items
        .filter(({ visitId }) => visitId === undefined)
        .map(({ item }) => {
          if (item.kind !== 'thought') return null;
          return (
            <li key={item.id} className="mb-6 min-w-0 pl-9 sm:ml-36 sm:pl-5">
              <p className="text-xs text-muted-foreground">Not placed yet</p>
              <CraftThoughtRow thought={item} />
            </li>
          );
        })}
    </>
  );
}

/** One cohesive fictional Timeline with explicit spending context and owner-bound action intents. */
export function CraftWorkspaceView({
  timeline,
  spending,
  onFinanceIntent,
}: {
  timeline: CraftTimeline;
  spending: CraftSpendingState;
  onFinanceIntent?: (intent: CraftFinanceIntent) => void;
}) {
  const workspace = useCraftWorkspace();
  return (
    <main className="app-trips mx-auto w-full min-w-0 max-w-6xl px-4 pb-16 pt-5 text-foreground sm:px-8 sm:pt-8 lg:px-10">
      <CraftHeader timeline={timeline} workspace={workspace} />
      <CraftToolbar workspace={workspace} />
      <CraftFeedback timeline={timeline} workspace={workspace} />
      {workspace.state.calendarOpen && (
        <CraftDateSummary timeline={timeline} showIdeas={workspace.state.showIdeas} />
      )}
      <CraftSpendingSection state={spending} onIntent={onFinanceIntent} />
      <ol aria-label="Trip timeline" className="min-w-0">
        {visibleCraftRows(timeline.rows, workspace.state.showIdeas).map((row) => (
          <TimelineRow key={row.id} row={row} workspace={workspace} />
        ))}
        <UnplacedThoughts workspace={workspace} />
      </ol>
      <CraftPanels timeline={timeline} workspace={workspace} />
    </main>
  );
}
