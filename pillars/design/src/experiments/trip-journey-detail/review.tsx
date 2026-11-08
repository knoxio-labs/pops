import { Badge, Button } from '@pops/ui';

/** Keep design questions and fixture provenance outside the proposed journey tool. */
export function JourneyReview({ layout }: { layout: 'legs' | 'window' }) {
  return (
    <aside className="space-y-2 border-b bg-muted/30 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">D01 · Review</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · changes reset on reload
        </span>
        {(['legs', 'window'] as const).map((id) => (
          <Button key={id} asChild variant={layout === id ? 'secondary' : 'ghost'}>
            <a target="_top" href={`/design/x/trip-journey-detail/${id}/s/trips/journey`}>
              {id === 'legs' ? 'Legs first' : 'Departure and arrival'}
            </a>
          </Button>
        ))}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Proposals and questions</summary>
        <div className="space-y-2 pb-2 text-sm">
          <p>
            Legs first leads with editable transport. Departure and arrival includes nearby source
            bookings from the local day before departure through the day after arrival. Both stay in
            route context and expose the same source edits, drag sorting, document links and undo.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Which starting view makes the journey easiest to arrange?</li>
            <li>
              Can you see connection time and local date changes without opening another screen?
            </li>
            <li>Are the nearby bookings and gaps useful at this level?</li>
          </ol>
          <p>
            Try changing clocks or time zones, dragging the second leg before the first, adding a
            different transport mode, linking a document and undoing. Each leg has independent
            purchase status; a new leg is not purchased. Location selection supplies its stored
            zone, which remains editable. Arbitrary new locations can be added in the picker. Source
            clock edits commit on leaving the field. Alternatives are editable independently;
            choosing Use journey retains the previous journey, including purchases, as an option.
            Add option starts without bookings or selected documents. Selection shares undo.
          </p>
          <p>
            Labels are source data or deterministic formatting. Clock calculations reuse the route
            planner's IANA resolver; invalid or ambiguous local times produce no duration. Buffer
            values are editable user inputs, not airport rules or travel estimates. Documents are
            fictional catalogue references; linking does not create a file or transfer ownership. No
            network writes, cancellations, persistence or LLM calls occur.
          </p>
        </div>
      </details>
    </aside>
  );
}
