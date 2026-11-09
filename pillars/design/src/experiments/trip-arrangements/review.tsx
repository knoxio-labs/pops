import { Badge, Button } from '@pops/ui';

/** Keeps the arrangement grouping comparison and source contracts outside the product view. */
export function ArrangementsReview({ layout }: { layout: 'route' | 'kinds' }) {
  return (
    <aside className="space-y-2 border-b bg-muted/30 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">T08 · Review</Badge>
        <span className="text-xs text-muted-foreground">Fictional data</span>
        {(['route', 'kinds'] as const).map((id) => (
          <Button key={id} asChild variant={layout === id ? 'secondary' : 'ghost'}>
            <a target="_top" href={`/design/x/trip-arrangements/${id}/s/trips/arrangements`}>
              {id === 'route' ? 'Along the route' : 'By kind'}
            </a>
          </Button>
        ))}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Proposals and questions</summary>
        <div className="space-y-2 pb-2 text-sm">
          <p>
            Along the route groups the same arrangements by their explicit route context. By kind
            groups transport, stays, tickets and rental together. Both share filters, source details
            and coverage issues.
          </p>
          <p>
            Which grouping makes arranging the trip easier? Are coverage issues clear without
            repeating the route? Is enough booking context visible before opening a source?
          </p>
          <p>
            Names, dates, booking states and source references are fictional typed facts. Grouping,
            filters and coverage findings are deterministic. Only purchased arrangements are hard
            commitments. A card opens its own source data; missing policy, fee or deadline data
            stays absent. No network, persistence or booking confirmation.
          </p>
        </div>
      </details>
    </aside>
  );
}
