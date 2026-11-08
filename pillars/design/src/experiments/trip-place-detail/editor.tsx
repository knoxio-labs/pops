import { IdeaSelectors, IdeaStatus, IdeaText } from './fields';
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
      className="space-y-4 rounded-xl border border-dashed border-foreground/30 bg-muted/60 p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <IdeaText field="name" label="Name" />
        </div>
        <IdeaStatus />
      </div>
      <IdeaSelectors />
      <section aria-label="Reason to go">
        <h2 className="text-xs font-medium text-muted-foreground">Reason to go</h2>
        <IdeaText field="reason" label="Reason to go" />
      </section>
      <IdeaLocation />
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3 rounded-lg bg-background/50 p-3">
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
