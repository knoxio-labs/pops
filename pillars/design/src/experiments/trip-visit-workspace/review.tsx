import { Badge, Button } from '@pops/ui';

/** The review metadata is outside the proposed product UI and never generated at card load. */
export function VisitReview({ layout }: { layout: 'periods' | 'days' }) {
  return (
    <aside className="space-y-2 border-b bg-muted/30 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">T06 · Review</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · changes reset on reload
        </span>
        <nav aria-label="Visit proposals" className="flex flex-wrap gap-1">
          {(['periods', 'days'] as const).map((value) => (
            <Button key={value} asChild variant={layout === value ? 'secondary' : 'ghost'}>
              <a target="_top" href={`/design/x/trip-visit-workspace/${value}/s/trips/visit`}>
                {value === 'periods' ? 'By accommodation' : 'By day'}
              </a>
            </Button>
          ))}
        </nav>
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Proposals and questions</summary>
        <div className="space-y-2 pb-2 text-sm">
          <p>
            Same records, two groupings: accommodation intervals or calendar days. Both support a
            single-day focus and undo. Switching proposals resets the local example.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Which grouping helps you place activities when changing hotels?</li>
            <li>Should undated people and ideas stay at the bottom, or nearer the visit header?</li>
            <li>Is the single-day view enough detail for arrival and hotel-change days?</li>
          </ol>
          <p>
            Try extending the second stay through 6 January, adding an activity in that interval,
            editing Marina’s date and focusing 3 January. Empty, approximate, overlapping stays and
            repeat visits are available as named states.
          </p>
          <p>
            Dates, names and arrangement states are stored source fields. Nights, coverage, day
            membership and clock labels are deterministic. People use existing typed person records;
            reusable contact selection is reviewed in C06. No generated card prose or backend
            persistence.
          </p>
        </div>
      </details>
    </aside>
  );
}
