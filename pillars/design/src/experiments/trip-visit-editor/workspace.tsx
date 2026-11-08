import { Undo2 } from 'lucide-react';

import { Button } from '@pops/ui';

import { useRouteState } from '../trip-route-editing/canvas-state';
import { VisitEditorContext } from './context';
import { VisitEditor } from './editor';
import { initialVisitEditor } from './fixture';
import { addVisitPlace, beginNewVisit, commitVisit, resetVisitDraft, visitErrors } from './model';
import { VisitEditorReview } from './review';
import { VisitTimeline } from './timeline';

import type { VisitEditorScenario } from './fixture';
import type { VisitDraft } from './model';

/** Compare immediate changes with an explicit draft inside the same vertical route. */
export function VisitWorkspace({
  mode,
  scenario = 'default',
}: {
  mode: 'direct' | 'draft';
  scenario?: VisitEditorScenario;
}) {
  const history = useRouteState(() => initialVisitEditor(scenario));
  const { state, change } = history;
  const apply = (draft: VisitDraft) => {
    const next = { ...state, draft };
    change(mode === 'direct' && !visitErrors(next, draft).length ? commitVisit(next, draft) : next);
  };
  const addPlace = (name: string) => {
    const next = addVisitPlace(state, name, crypto.randomUUID());
    change(
      mode === 'direct' && !visitErrors(next, next.draft).length
        ? commitVisit(next, next.draft)
        : next
    );
  };
  const dirty =
    JSON.stringify(state.visits.find((visit) => visit.id === state.draft.id)) !==
    JSON.stringify(state.draft);
  const canInsert = !state.creating && (mode === 'direct' || !dirty);
  const editor = (
    <VisitEditor
      onSave={() => change(commitVisit(state, state.draft))}
      onDiscard={() => change(resetVisitDraft(state))}
    />
  );
  return (
    <VisitEditorContext value={{ state, update: apply, addPlace, mode }}>
      <VisitEditorReview mode={mode} />
      <main className="mx-auto max-w-4xl space-y-4 px-5 py-6">
        <header className="flex items-center justify-between">
          <h2 className="font-semibold">Brazil</h2>
          <Button variant="ghost" onClick={history.undo} disabled={!history.canUndo}>
            <Undo2 className="size-4" />
            Undo
          </Button>
        </header>
        <VisitTimeline
          editor={editor}
          canInsert={canInsert}
          insert={(id) => change(beginNewVisit(state, id, crypto.randomUUID()))}
        />
      </main>
    </VisitEditorContext>
  );
}
