import { Badge, Button } from '@pops/ui';

/** Review metadata and provenance stay outside the proposed product UI. */
export function DecisionReview({ layout }: { layout: 'options' | 'impact' }) {
  return (
    <aside className="space-y-2 border-b bg-muted/30 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">D05 · Review</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · changes reset on reload
        </span>
        {(['options', 'impact'] as const).map((id) => (
          <Button key={id} asChild variant={layout === id ? 'secondary' : 'ghost'}>
            <a target="_top" href={`/design/x/trip-decision-detail/${id}/s/trips/decision`}>
              {id === 'options' ? 'Options first' : 'Impact first'}
            </a>
          </Button>
        ))}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Proposals and questions</summary>
        <div className="space-y-2 pb-2 text-sm">
          <p>
            Options first groups each option with its notes and linked plans. Impact first lists the
            affected plans and the options referencing each one before the choice cards.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Do you start by choosing an option or checking affected plans?</li>
            <li>
              Is selecting, changing and reopening a decision clear without hiding alternatives?
            </li>
          </ol>
          <p>
            Try adding a free-form option, linking plans, choosing it, editing the deadline,
            reopening and undoing. Choosing records this decision only; it does not buy, cancel or
            rearrange bookings.
          </p>
          <p>
            Question, notes and option names are user text. Deadline and linked plan identities are
            explicit inputs. Labels, associations and unavailable-reference findings are
            deterministic. No costs, availability, travel time or inferred route mutations. Local
            snapshots only; no persistence or LLM calls.
          </p>
        </div>
      </details>
    </aside>
  );
}
