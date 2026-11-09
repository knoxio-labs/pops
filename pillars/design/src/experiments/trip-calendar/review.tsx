import { Badge, Button } from '@pops/ui';

/** Explains the calendar alternatives and source contracts outside the product view. */
export function CalendarReview({ layout }: { layout: 'agenda' | 'timeline' }) {
  return (
    <aside className="space-y-2 border-b bg-muted/30 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">T04 · Review</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · filters reset on reload
        </span>
        {(['agenda', 'timeline'] as const).map((id) => (
          <Button asChild key={id} variant={layout === id ? 'secondary' : 'ghost'}>
            <a target="_top" href={`/design/x/trip-calendar/${id}/s/trips/calendar`}>
              {id === 'agenda' ? 'Compact agenda' : 'Clock rail'}
            </a>
          </Button>
        ))}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Proposals and questions</summary>
        <div className="space-y-2 pb-2 text-sm">
          <p>
            Compact agenda groups boundaries and floating availability by day. Clock rail separates
            display-zone clocks from source cards along a dotted vertical timeline. Both use the
            same date range, zone, kind filter and inspect dialogs.
          </p>
          <p>
            Which projection is easier to scan around flights? Are source departure and arrival
            zones clear beside the display-zone axis? Is floating contact availability distinct from
            a timed commitment?
          </p>
          <p>
            Titles, locations, instants, zones, purchase flags, configured timing rules and
            inclusive contact availability dates are fictional source facts. Date grouping, display
            clocks, the selected flight window and timing findings are deterministic. Only purchased
            bookings are hard commitments; other outlines are dashed. Inspect opens the selected
            source data in place. No booking confirmation, network, persistence or generated text.
          </p>
        </div>
      </details>
    </aside>
  );
}
