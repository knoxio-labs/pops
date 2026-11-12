import { tripPlaceName } from '@/fixtures/trip-places';
import { Check } from 'lucide-react';

import { Button } from '@pops/ui';

import { date } from './source-details';

import type { CraftTimeline } from '@/fixtures/trip-timeline-craft';

import type { ComposerDraft } from './model';
import type { CraftWorkspace } from './use-workspace';

function contextLabel(draft: ComposerDraft, timeline: CraftTimeline) {
  const { context } = draft;
  const visit = timeline.rows.find((row) => row.kind === 'visit' && row.id === context.visitId);
  if (context.kind === 'stay') {
    const place = visit?.kind === 'visit' ? `${tripPlaceName(visit.placeId)} · ` : '';
    return `Stay idea · ${place}${date(context.gap.start)} – ${date(context.gap.end)}`;
  }
  if (context.visitId === undefined) return 'Trip thought';
  if (visit?.kind === 'visit') return `Thought · ${tripPlaceName(visit.placeId)}`;
  return 'Visit thought';
}

function SavedDrafts({
  timeline,
  workspace,
}: {
  timeline: CraftTimeline;
  workspace: CraftWorkspace;
}) {
  if (workspace.state.savedDrafts.length === 0) return null;
  return (
    <section aria-label="Saved drafts" className="mb-6 rounded-lg border bg-card p-4 text-sm">
      <p className="mb-3 font-medium">Previous text kept as drafts.</p>
      <ul className="space-y-4">
        {workspace.state.savedDrafts.map((draft, index) => {
          const label = contextLabel(draft, timeline);
          return (
            <li key={draft.id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1 basis-40">
                <p className="text-muted-foreground">{label}</p>
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words">{draft.text}</p>
              </div>
              <Button
                variant="ghost"
                aria-label={`Resume saved draft ${index + 1}: ${label}`}
                onClick={() => workspace.resume(draft.id)}
              >
                Resume saved draft
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** One-level item Undo and individually addressable unsaved drafts remain contextual to the Timeline. */
export function CraftFeedback({
  timeline,
  workspace,
}: {
  timeline: CraftTimeline;
  workspace: CraftWorkspace;
}) {
  return (
    <>
      {workspace.state.lastAdded && (
        <div
          role="status"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2 text-sm"
        >
          <span className="flex items-center gap-2">
            <Check className="size-4" aria-hidden />
            Added to timeline
          </span>
          <Button variant="ghost" onClick={workspace.undo}>
            Undo
          </Button>
        </div>
      )}
      <SavedDrafts timeline={timeline} workspace={workspace} />
    </>
  );
}
