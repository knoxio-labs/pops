import { Badge, Button } from '@pops/ui';

/** Review instructions and proposal questions are outside the proposed product UI. */
export function EventReview({ layout }: { layout: 'details' | 'route' }) {
  return (
    <aside className="space-y-2 border-b bg-muted/30 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">D03 · Approved</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · changes reset on reload
        </span>
        <nav aria-label="Event proposals" className="flex gap-1">
          {(['details', 'route'] as const).map((id) => (
            <Button key={id} asChild variant={layout === id ? 'secondary' : 'ghost'}>
              <a target="_top" href={`/design/x/trip-event-detail/${id}/s/trips/event`}>
                {id === 'details' ? 'Event first' : 'In route'}
              </a>
            </Button>
          ))}
        </nav>
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Proposals and questions</summary>
        <div className="space-y-2 pb-2 text-sm">
          <p>
            Event first keeps the editor above route effects. In route places it inside its visit
            and shows surrounding route context. Both use the same source fields; switching
            proposals resets the example.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Which layout works better for an event that could change the route?</li>
            <li>
              Are the consequences clear before adding an alternative city to the working route?
            </li>
            <li>
              Do venue, organiser, links and ticket controls give enough detail without slowing
              capture?
            </li>
          </ol>
          <p>
            Try changing the event dates, selecting a different visit, adding a venue, selecting a
            document and adding the alternative city to the route. Undo restores both event details
            and route changes. New, purchased, conflicting-date and missing-reference states are
            available.
          </p>
          <p>
            Names and notes are user text; dates, clocks, references, URLs, intention and purchase
            are stored fields. Coverage and conflicts are deterministic. Reference pickers use
            fictional local identities; Contacts and Documents own their eventual records. No
            generated-on-load text or product persistence.
          </p>
        </div>
      </details>
    </aside>
  );
}
