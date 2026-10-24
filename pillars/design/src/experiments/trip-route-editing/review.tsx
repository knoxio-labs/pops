import { Badge, Button } from '@pops/ui';

/** Design choices and questions live outside the proposed product UI. */
export function PlannerReview({ layout }: { layout: 'inline' | 'side-editor' | 'direct' }) {
  return (
    <aside className="space-y-3 border-b bg-muted/30 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">T03 · Review</Badge>
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
          <li>Can you build and move alternative sections without choosing a fixed path?</li>
          <li>Does a side trip belong nested under its base city?</li>
        </ol>
        <p>
          Try editing Curitiba, moving a visit, adding an alternative section, adding a return visit
          and adding a side trip. Purchases keep their dates; editing a visit can flag arrangements
          outside its bounds. Hover insertion is available on keyboard focus and touch. Empty,
          repeat-visit and nested-trip states are available.
        </p>
        <p>
          Data: place input → reusable place ID; date/month controls → calendar values; duration →
          numeric weeks; order → visit IDs; side trip → parent visit ID; alternative sections →
          ordered card IDs. Labels, date ranges and conflicts are deterministic. Prototype state is
          local. Generated annotations would be saved with their source version and reused until the
          source changes or you request a refresh; rendering cards does not generate text.
        </p>
      </div>
    </details>
  );
}
