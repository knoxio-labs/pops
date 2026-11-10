import { Badge, Button } from '@pops/ui';

/** Design choices and questions live outside the proposed product UI. */
export function PlannerReview({ layout }: { layout: 'inline' | 'side-editor' | 'direct' }) {
  return (
    <aside className="space-y-3 border-b bg-muted/30 p-3 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">T03 · Approved</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · changes reset on reload
        </span>
      </div>
      <nav aria-label="Planner proposals" className="flex flex-wrap gap-2">
        {(['direct', 'inline', 'side-editor'] as const).map((id) => (
          <Button key={id} asChild variant={layout === id ? 'default' : 'outline'}>
            <a target="_top" href={`/design/x/trip-route-editing/${id}/s/trips/route`}>
              {
                {
                  direct: 'Direct editing',
                  inline: 'Earlier inline',
                  'side-editor': 'Earlier side editor',
                }[id]
              }
            </a>
          </Button>
        ))}
      </nav>
      <ReviewDetails />
    </aside>
  );
}

function ReviewDetails() {
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
        Proposals and questions
      </summary>
      <div className="space-y-3 pb-3 text-sm">
        <p>
          Direct editing uses draggable visits, hover insertion and immediate field changes. Drag
          events and stays between cities. Undo reverses edits. Earlier form layouts remain for
          comparison.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Does direct editing give you enough freedom without losing the route order?</li>
          <li>Can you rearrange visits and move events between them without breaking your flow?</li>
          <li>Can you review a complete alternative path and move it into the main route?</li>
        </ol>
        <p>
          All visits stay at the same route level. Use path moves its cities and linked bookings
          into the main route while keeping the competing alternatives. Undo restores the whole
          move. Try the alternative-paths and flat-return named states. Purchases retain their
          source dates. Controls reveal when their card is hovered or focused and remain available
          on touch. Direct editing was approved on 10 November 2026; earlier layouts remain for
          comparison.
        </p>
        <p>
          Data: place input → reusable place ID; date/month controls → calendar values; duration →
          numeric weeks; order → flat visit IDs; alternative sections → ordered card IDs. Labels,
          date ranges and conflicts are deterministic. Prototype state is local. Generated
          annotations would be saved with their source version and reused until the source changes
          or you request a refresh; rendering cards does not generate text.
        </p>
      </div>
    </details>
  );
}
