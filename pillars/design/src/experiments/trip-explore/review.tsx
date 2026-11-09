import { Badge, Button } from '@pops/ui';

/** Keeps grouping proposals and source provenance outside the exploratory collection. */
export function ExploreReview({ layout }: { layout: 'collection' | 'cities' }) {
  return (
    <aside className="space-y-2 border-b bg-muted/30 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">T05 · Review</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · changes reset on reload
        </span>
        {(['collection', 'cities'] as const).map((id) => (
          <Button key={id} asChild variant={layout === id ? 'secondary' : 'ghost'}>
            <a target="_top" href={`/design/x/trip-explore/${id}/s/trips/explore`}>
              {id === 'collection' ? 'One collection' : 'By location'}
            </a>
          </Button>
        ))}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Proposals and questions</summary>
        <div className="space-y-2 pb-2 text-sm">
          <p>
            One collection mixes matching possibilities in a compact list. By location groups the
            same records under their explicit source locations, with unassigned records together.
            Both share capture, filters, source editing and Undo.
          </p>
          <p>
            Which grouping makes the collection easier to browse before choosing dates? Is capturing
            text with optional kind and location enough to keep a possibility?
          </p>
          <p>
            Titles, notes, kinds and source references are fictional source facts. Filtering,
            grouping and unavailable-reference findings are deterministic. Open a card to edit that
            record in place. Capture keeps unclassified text without inferring dates, location or
            intent. No network, persistence, generated recommendations or booking confirmation.
          </p>
        </div>
      </details>
    </aside>
  );
}
