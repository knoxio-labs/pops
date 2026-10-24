import { tripDisplayName, tripMetadata } from '@/fixtures/trip-metadata';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { Button, SortableGrid } from '@pops/ui';

import { DirectCard } from './direct-card';
import { InsertVisit } from './insert';
import {
  addVisit,
  assignItem,
  choosePath,
  initialPlanner,
  moveVisit,
  removeVisit,
  reorderRoute,
  updateVisit,
} from './model';
import { PathOptions } from './path-options';
import { PlannerReview } from './review';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { PlannerScenario, PlannerState } from './model';

/** Direct-manipulation route: drag nodes, insert on hover and edit values without a save step. */
export function DirectPlanner({ scenario = 'default' }: { scenario?: PlannerScenario }) {
  const { state, change, undo, canUndo } = useDirectRoute(scenario);
  const records = state.order.flatMap((id) => state.records.filter((r) => r.id === id));
  function reorder(next: TripRecord[]) {
    change(
      reorderRoute(
        state,
        next.map((record) => record.id)
      )
    );
  }
  return (
    <>
      <PlannerReview layout="direct" />
      <main className="mx-auto max-w-7xl space-y-4 p-5 md:p-8">
        <DirectHeader
          canUndo={canUndo}
          undo={undo}
          onAdd={(placeId) => change(addVisit(state, placeId))}
        />

        <SortableGrid
          items={records}
          getKey={(r) => r.id}
          columnsClassName="grid-cols-1 lg:grid-cols-2"
          onReorder={reorder}
          renderItem={(record, index) => (
            <DirectNode record={record} index={index} state={state} change={change} />
          )}
        />
      </main>
    </>
  );
}

function NestedCards({
  parentId,
  state,
  change,
}: {
  parentId: string;
  state: PlannerState;
  change: (state: PlannerState) => void;
}) {
  return state.records
    .filter((r) => state.parents[r.id] === parentId)
    .map((record) => (
      <div key={record.id} className="ml-4 border-l pl-3">
        <DirectCard
          record={record}
          state={state}
          index={0}
          onEdit={(r) => change(updateVisit(state, r))}
          onAssign={(id) => change(assignItem(state, id, record.id))}
          onRemove={() =>
            change({
              ...state,
              parents: Object.fromEntries(
                Object.entries(state.parents).filter(([id]) => id !== record.id)
              ),
            })
          }
          onMove={() => {}}
          onAdd={(placeId) => change(addVisit(state, placeId, record.id, record.id))}
        />
        <NestedCards parentId={record.id} state={state} change={change} />
      </div>
    ));
}

function useDirectRoute(scenario: PlannerScenario) {
  const [state, setState] = useState(() => initialPlanner(scenario));
  const [history, setHistory] = useState<PlannerState[]>([]);
  function change(next: PlannerState) {
    setHistory([...history, state]);
    setState(next);
  }
  function undo() {
    const previous = history.at(-1);
    if (previous) {
      setState(previous);
      setHistory(history.slice(0, -1));
    }
  }
  return { state, change, undo, canUndo: history.length > 0 };
}

function DirectHeader({
  canUndo,
  undo,
  onAdd,
}: {
  canUndo: boolean;
  undo: () => void;
  onAdd: (placeId: string) => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="mb-2 text-sm text-muted-foreground">{tripDisplayName(tripMetadata)}</p>
        <h1 className="text-3xl font-bold">Route planner</h1>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" disabled={!canUndo} onClick={undo}>
          <RotateCcw className="size-4" aria-hidden />
          Undo
        </Button>
        <InsertVisit onAdd={onAdd} />
      </div>
    </header>
  );
}

function DirectNode({
  record,
  index,
  state,
  change,
}: {
  record: TripRecord;
  index: number;
  state: PlannerState;
  change: (state: PlannerState) => void;
}) {
  const edit = (next: TripRecord) => change(updateVisit(state, next));
  return (
    <div className="group space-y-2">
      {record.kind === 'gap' ? (
        <PathOptions
          gap={record}
          state={state}
          onChoose={(id) => change(choosePath(state, record.id, id))}
          direct
          onEdit={edit}
        />
      ) : (
        <DirectCard
          record={record}
          state={state}
          index={index}
          onEdit={edit}
          onAssign={(id) => change(assignItem(state, id, record.id))}
          onRemove={() => change(removeVisit(state, record.id))}
          onMove={(delta) => change(moveVisit(state, record.id, delta))}
          onAdd={(placeId) => change(addVisit(state, placeId, record.id, record.id))}
        />
      )}
      <NestedCards parentId={record.id} state={state} change={change} />
      <div className="flex min-h-11 items-center justify-center border-t border-dashed">
        <InsertVisit
          subtle
          label={`Insert after stop ${index + 1}`}
          onAdd={(placeId) => change(addVisit(state, placeId, record.id))}
        />
      </div>
    </div>
  );
}
