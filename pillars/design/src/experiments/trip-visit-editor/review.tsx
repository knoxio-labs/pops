import { Badge, Button } from '@pops/ui';

/** Save behaviour and source provenance remain review metadata outside the product editor. */
export function VisitEditorReview({ mode }: { mode: 'direct' | 'draft' }) {
  return (
    <aside className="space-y-2 border-b bg-muted/30 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">D07 · Review</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · changes reset on reload
        </span>
        {(['direct', 'draft'] as const).map((id) => (
          <Button key={id} asChild variant={mode === id ? 'secondary' : 'ghost'}>
            <a target="_top" href={`/design/x/trip-visit-editor/${id}/s/trips/visit-edit`}>
              {id === 'direct' ? 'Direct edits' : 'Save a draft'}
            </a>
          </Button>
        ))}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Proposals and questions</summary>
        <div className="space-y-2 pb-2 text-sm">
          <p>
            Direct edits applies structurally valid field changes immediately, with Undo. Save a
            draft keeps the route source unchanged until Save changes. Both expose the same fields
            inside the route. Hover a connection to insert a visit.
          </p>
          <ol className="list-decimal pl-5">
            <li>Apply changes as you work, or save a draft?</li>
            <li>Are city timing and the independent accommodation dates clear?</li>
          </ol>
          <p>
            Try a new city, another visit to the same city, month-only timing, partial dates, a
            contradictory date range and Undo. Only purchased arrangements are hard; city timing
            remains soft. Reversed dates and booking conflicts stay editable and visible.
          </p>
          <p>
            City identities, dates, month/part, duration/unit and notes are explicit source values.
            Labels and discrepancy findings are deterministic. Adding a city does not geocode it. No
            dates are copied from stays or events. No persistence, purchases, booking changes or LLM
            calls.
          </p>
        </div>
      </details>
    </aside>
  );
}
