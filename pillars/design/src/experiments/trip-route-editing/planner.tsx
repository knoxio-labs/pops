import { tripDisplayName, tripMetadata } from '@/fixtures/trip-metadata';
import { Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { Button, cn } from '@pops/ui';

import { AddVisit } from './add-visit';
import { addVisit, initialPlanner, updateVisit } from './model';
import { PlannerReview } from './review';
import { VisitEditor } from './visit-editor';
import { PlannerVisits } from './visits';

import type { PlannerScenario, PlannerState } from './model';

/** Route planning proposals edit only local, typed fixture state until reload. */
export function RoutePlanner({
  layout,
  scenario = 'default',
}: {
  layout: 'inline' | 'side-editor';
  scenario?: PlannerScenario;
}) {
  const { state, selected, setSelected, adding, setAdding, change, history, undo } =
    usePlannerState(scenario);
  const record = state.records.find((r) => r.id === selected);
  const editor = record && (
    <VisitEditor
      key={record.id}
      record={record}
      onSave={(r) => {
        change(updateVisit(state, r));
        setSelected(null);
      }}
      onCancel={() => setSelected(null)}
    />
  );
  return (
    <>
      <PlannerReview layout={layout} />
      <main className="mx-auto max-w-7xl space-y-6 p-5 md:p-8">
        <PlannerHeader canUndo={history.length > 0} onAdd={() => setAdding({})} onUndo={undo} />
        <div
          className={cn(
            'grid items-start gap-6',
            layout === 'side-editor' && record && 'xl:grid-cols-2'
          )}
        >
          <PlannerVisits
            state={state}
            layout={layout}
            selected={selected}
            editor={editor}
            onChange={change}
            onSelect={setSelected}
            onAdd={(id) => setAdding({ parentId: id })}
          />
          {layout === 'side-editor' && record && (
            <div className="order-first xl:sticky xl:top-4 xl:order-last">{editor}</div>
          )}
        </div>
      </main>
      {adding && (
        <AddVisit
          state={state}
          parentId={adding.parentId}
          onClose={() => setAdding(null)}
          onAdd={(placeId, afterId) => {
            change(addVisit(state, placeId, afterId, adding.parentId));
            setAdding(null);
          }}
        />
      )}
    </>
  );
}

function PlannerHeader({
  canUndo,
  onAdd,
  onUndo,
}: {
  canUndo: boolean;
  onAdd: () => void;
  onUndo: () => void;
}) {
  return (
    <header className="space-y-4">
      <a
        target="_top"
        className="inline-flex min-h-11 items-center text-sm underline"
        href="/design/x/trip-overview-shape/route-first/s/trips/overview"
      >
        {tripDisplayName(tripMetadata)} / Overview
      </a>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Route planner</h1>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!canUndo} onClick={onUndo}>
            <RotateCcw className="size-4" aria-hidden />
            Undo
          </Button>
          <Button onClick={onAdd}>
            <Plus className="size-4" aria-hidden />
            Add visit
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Purchased arrangements keep their dates when you edit the route.
      </p>
    </header>
  );
}

function usePlannerState(scenario: PlannerScenario) {
  const [state, setState] = useState(() => initialPlanner(scenario));
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ parentId?: string } | null>(null);
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
      setSelected(null);
    }
  }
  return { state, selected, setSelected, adding, setAdding, change, history, undo };
}
