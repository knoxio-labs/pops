import { Badge, Button } from '@pops/ui';

/** Prototype questions and data provenance live outside the product form. */
export function SettingsReview({ layout }: { layout: 'quick' | 'full' }) {
  return (
    <aside className="space-y-2 border-b bg-muted/30 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">D06 · Review</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · changes reset on reload
        </span>
        {(['quick', 'full'] as const).map((id) => (
          <Button key={id} asChild variant={id === layout ? 'secondary' : 'ghost'}>
            <a target="_top" href={`/design/x/trip-settings/${id}/s/trips/settings`}>
              {id === 'quick' ? 'Quick start' : 'All fields'}
            </a>
          </Button>
        ))}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Proposals and questions</summary>
        <div className="space-y-2 pb-2 text-sm">
          <p>
            Quick start leads with destination and creation; other settings stay under More options.
            All fields exposes the complete form before creation. Both open the same settings after
            creating.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>All fields selected. Does the When subtitle capture your timing intention?</li>
            <li>Are the route date summary and its source stops/journeys clear?</li>
          </ol>
          <p>
            Try a blank trip, a custom name, arbitrary When text, a different tag, nesting,
            unlinking and undo. Parent and tag selection never copy dates, bookings or membership.
          </p>
          <p>
            Name, destination, When and notes are user text. When is the verbatim trip subtitle and
            is never parsed into dates. Route dates are derived from the first and last route
            records, preserving unknown outer bounds. No independently entered trip date fields.
            Catalogue selections and findings are deterministic. Unlinking preserves reusable
            records. Local snapshots only; no network writes, geocoding or LLM calls.
          </p>
        </div>
      </details>
    </aside>
  );
}
