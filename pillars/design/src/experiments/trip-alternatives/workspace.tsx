import { useState } from 'react';

import { captureCard } from '../trip-route-editing/canvas-actions';
import { useRouteState } from '../trip-route-editing/canvas-state';
import { AddCity } from './add-city';
import { Comparison } from './comparison';
import { AlternativesHeader } from './header';
import { initialAlternatives } from './model';
import { AlternativePath, PathPicker } from './paths';
import { AlternativesReview } from './review';

import type { CanvasState } from '../trip-route-editing/canvas-model';
import type { AlternativeScenario } from './model';

/** Compare local path previews and apply only an explicit selection; all alternatives survive undo. */
export function AlternativesWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'paths' | 'changes';
  scenario?: AlternativeScenario;
}) {
  const history = useRouteState(() => initialAlternatives(scenario));
  const { state, change } = history;
  const [previewId, setPreviewId] = useState(
    () =>
      state.canvas.sections.find((section) => section.id !== state.workingId)?.id ?? state.workingId
  );
  const preview = state.canvas.sections.find((section) => section.id === previewId);
  function changeCanvas(canvas: CanvasState) {
    change({ ...state, canvas });
  }
  function addPath(name: string) {
    const withSection = captureCard(state.canvas, 'section', name, { gapId: state.gapId });
    const section = withSection.sections.at(-1);
    if (!section) return;
    changeCanvas(captureCard(withSection, 'city', name, { sectionId: section.id }));
    setPreviewId(section.id);
  }
  return (
    <>
      <AlternativesReview layout={layout} />
      <main className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
        <AlternativesHeader state={state} canUndo={history.canUndo} undo={history.undo} />
        {layout === 'changes' && (
          <PathPicker state={state} previewId={previewId} select={setPreviewId} />
        )}
        {layout === 'changes' && preview && (
          <Comparison state={state} preview={preview} change={change} changeCanvas={changeCanvas} />
        )}
        <section aria-label="Paths" className="space-y-3">
          {layout === 'paths' &&
            state.canvas.sections.map((section) => (
              <AlternativePath
                key={section.id}
                state={state}
                section={section}
                layout={layout}
                previewId={previewId}
                select={setPreviewId}
                change={change}
                changeCanvas={changeCanvas}
              />
            ))}
          <AddCity label="New path" action="Add path" add={addPath} />
        </section>
      </main>
    </>
  );
}
