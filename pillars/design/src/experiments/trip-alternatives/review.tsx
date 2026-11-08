import { Badge, Button } from '@pops/ui';

/** Keep prototype instructions and provenance outside the proposed comparison tool. */
export function AlternativesReview({ layout }: { layout: 'paths' | 'changes' }) {
  return (
    <aside className="space-y-2 border-b bg-muted/30 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">T07 · Review</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · changes reset on reload
        </span>
        {(['paths', 'changes'] as const).map((id) => (
          <Button key={id} asChild variant={layout === id ? 'secondary' : 'ghost'}>
            <a target="_top" href={`/design/x/trip-alternatives/${id}/s/trips/alternatives`}>
              {id === 'paths' ? 'Paths first' : 'Changes first'}
            </a>
          </Button>
        ))}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Proposals and questions</summary>
        <div className="space-y-2 pb-2 text-sm">
          <p>
            Paths first keeps complete options stacked. Changes first leads with the difference
            between the working route and the candidate. Both use one column and the same source
            records.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Which order helps you compare without losing the surrounding route?</li>
            <li>Are affected purchases visible enough before using a different path?</li>
            <li>Can an option develop without becoming a booking?</li>
          </ol>
          <p>
            Preview Minas, revise its dates, add another city or path, then use the path and undo.
            Competing paths and purchases stay intact. Dates, names and findings derive from typed
            records; coverage uses exclusive checkout dates. Unknown dates produce no invented
            counts. Timing checks here compare calendar dates, not flight clocks or estimated travel
            time. No LLM calls, payments, cancellations or backend writes occur.
          </p>
        </div>
      </details>
    </aside>
  );
}
