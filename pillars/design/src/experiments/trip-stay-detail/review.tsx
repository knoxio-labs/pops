import { Badge, Button } from '@pops/ui';

/** Design questions and fixture provenance are review chrome, outside the proposed tool. */
export function StayReview({ layout }: { layout: 'details' | 'visit' }) {
  return (
    <aside className="space-y-2 border-b bg-muted/30 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">D02 · Review</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · changes reset on reload
        </span>
        {(['details', 'visit'] as const).map((id) => (
          <Button key={id} asChild variant={layout === id ? 'secondary' : 'ghost'}>
            <a target="_top" href={`/design/x/trip-stay-detail/${id}/s/trips/stay`}>
              {id === 'details' ? 'Stay first' : 'In visit'}
            </a>
          </Button>
        ))}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Proposals and questions</summary>
        <div className="space-y-2 pb-2 text-sm">
          <p>
            Stay first opens the accommodation details with the visit timeline available below. In
            visit keeps neighbouring stays and visit activities visible around the same editor. Both
            use one source snapshot and shared undo.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Which starting view makes a stay easiest to arrange?</li>
            <li>
              Are the dates, host and check-in details accessible enough for a hotel or a family
              stay?
            </li>
          </ol>
          <p>
            Try changing checkout, switching to a friend or family stay, choosing or adding a host,
            linking documents and undoing. Only Purchased is hard; Agreed and Reserved remain soft.
            A type change preserves entered facts.
          </p>
          <p>
            Names, address, notes, reference and contact methods are stored text. Type, status and
            contact/document identities are explicit selections. Local date and clock fields are
            separate. Night counts use checkout-exclusive calendar dates; warnings derive from the
            recorded visit and adjacent stays. Unknown intervals do not generate coverage counts.
            Document chips link originals, and removing a chip only unlinks it. All data stays in
            this mounted prototype; no Contacts or Documents records are written, no booking is
            changed and no LLM runs.
          </p>
        </div>
      </details>
    </aside>
  );
}
