import { Badge, Button } from '@pops/ui';

/** Keeps local navigation limits, fictional provenance and the fixed date reference outside the product list. */
export function HomeReview({
  layout,
  referenceDate,
}: {
  layout: 'list' | 'grouped';
  referenceDate: string;
}) {
  return (
    <aside className="space-y-2 border-b border-border bg-muted/30 px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">T01 · Review</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · local changes reset on reload
        </span>
        {(['list', 'grouped'] as const).map((id) => (
          <Button
            key={id}
            asChild
            variant={layout === id ? 'secondary' : 'ghost'}
            className="min-h-11 text-sm"
          >
            <a target="_top" href={`/design/x/trips-home/${id}/s/trips/home`}>
              {id === 'list' ? 'Compact list' : 'Grouped by route dates'}
            </a>
          </Button>
        ))}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">
          Comparison and provenance
        </summary>
        <div className="space-y-2 pb-2 text-sm text-muted-foreground">
          <p>
            Both variants use the same trips, search, route-date filter and approved all-fields
            creation controls. Grouping is a computed view, not a trip status. Open boundaries
            remain unknown; free-text When is never parsed into dates.
          </p>
          <p>
            Names, destinations, subtitles, route order, dates, parents, tags and notes are
            fictional source facts. The fixed reference date is {referenceDate}. New records use
            that date at 12:00 UTC for local update metadata. No wall-clock comparison, generated
            route dates, backend or persistence.
          </p>
          <p>
            Opening a row shows only that selected record's stored route and settings in a local
            read-only view. Creation adds a local trip with no route dates; Undo removes that
            creation. Cancel discards only the creation draft, while closing the dialog keeps it for
            reopening.
          </p>
        </div>
      </details>
    </aside>
  );
}
