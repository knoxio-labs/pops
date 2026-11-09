import { Badge, Button } from '@pops/ui';

/** Keeps trip-people grouping proposals and source provenance outside the product view. */
export function TripPeopleReview({ layout }: { layout: 'route' | 'people' }) {
  return (
    <aside className="space-y-2 border-b bg-muted/30 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">T09 · Review</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · local changes reset on reload
        </span>
        {(['route', 'people'] as const).map((id) => (
          <Button key={id} asChild variant={layout === id ? 'secondary' : 'ghost'}>
            <a target="_top" href={`/design/x/trip-people/${id}/s/trips/people`}>
              {id === 'route' ? 'By route' : 'By person'}
            </a>
          </Button>
        ))}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Proposals and questions</summary>
        <div className="space-y-2 pb-2 text-sm">
          <p>
            By route groups the same people and meeting plans under their selected visits. By person
            keeps each person's trip context together. Both share source details, meeting edits,
            existing-contact linking and Undo.
          </p>
          <p>
            Which grouping makes it easier to see whom to meet during a trip? Are tentative plans,
            agreed meetings and dated availability distinct?
          </p>
          <p>
            Names, methods, meeting plans, visit references and availability statements are
            fictional typed source facts. Exact overlap requires valid bounded dates in the same
            location. Availability does not schedule a meeting; unknown dates do not create a task.
            Source conflicts and unavailable references remain visible. A card opens the selected
            person's own details. No contact creation, network, persistence or generated
            recommendations.
          </p>
        </div>
      </details>
    </aside>
  );
}
