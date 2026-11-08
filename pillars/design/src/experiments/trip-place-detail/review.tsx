import { Badge, Button } from '@pops/ui';

/** Keep proposal questions and text provenance outside the proposed idea editor. */
export function IdeaReview({ layout }: { layout: 'details' | 'route' }) {
  return (
    <aside className="space-y-2 border-b bg-muted/30 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">D04 · Review</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · changes reset on reload
        </span>
        {(['details', 'route'] as const).map((id) => (
          <Button key={id} asChild variant={layout === id ? 'secondary' : 'ghost'}>
            <a target="_top" href={`/design/x/trip-place-detail/${id}/s/trips/place`}>
              {id === 'details' ? 'Details first' : 'In route'}
            </a>
          </Button>
        ))}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Proposals and questions</summary>
        <div className="space-y-2 pb-2 text-sm">
          <p>
            Details first leads with the idea and keeps route context available below. In route
            places the same editor within the selected visit. A city, timing and visit are
            independent optional fields; changing one never silently changes the others.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Are the idea’s location, timing and route placement clear as separate facts?</li>
            <li>
              Do purpose, reason and recommendations capture why you want to go, including meeting
              people?
            </li>
          </ol>
          <p>
            Click the name, reason or address to edit directly; blur commits and Escape cancels.
            Timing, location, placement and sources open focused editors, with removal actions
            inside. Try an undated idea, month-level timing, exact dates outside the selected visit,
            another city, a new city, multiple recommendations or links, and undo. Choosing In plan
            keeps the idea soft. The editor records an intention; it does not buy an event or change
            a route booking.
          </p>
          <p>
            Names, reason, address, recommendations, link labels/URLs and notes are stored user
            text. Purpose, type, status and source identities are explicit selections. Timing labels
            and date discrepancies are deterministic projections. No ratings, opening hours, travel
            time or cost are invented. Links open only absolute HTTP(S) URLs. Changes are local,
            with no geocoding, remote writes, persistence or LLM calls.
          </p>
        </div>
      </details>
    </aside>
  );
}
