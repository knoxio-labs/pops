import { IdeaSelectors, IdeaText } from './fields';
import { IdeaLinks } from './links';
import { IdeaLocation } from './location';
import { IdeaRecommendations } from './recommendations';
import { IdeaTiming } from './timing';
import { IdeaVisitPicker } from './visit-picker';

/** An idea stays soft, even when included in the plan; source facts remain directly editable. */
export function IdeaEditor() {
  return (
    <article
      aria-label="Idea editor"
      className="space-y-3 rounded-xl border border-dashed border-foreground/30 bg-muted/60 p-4 shadow-sm"
    >
      <IdeaText field="name" label="Name" />
      <IdeaSelectors />
      <IdeaText field="reason" label="Reason to go" />
      <IdeaLocation />
      <div className="flex flex-wrap items-center gap-3 border-t pt-3">
        <IdeaTiming />
        <IdeaVisitPicker />
      </div>
      <IdeaRecommendations />
      <IdeaLinks />
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Notes</summary>
        <IdeaText field="notes" label="Notes" />
      </details>
    </article>
  );
}
