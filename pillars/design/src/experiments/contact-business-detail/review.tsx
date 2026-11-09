import { Badge, Button } from '@pops/ui';

/** Keeps design proposals and source provenance outside the product surface. */
export function BusinessReview({ layout }: { layout: 'details' | 'locations' }) {
  return (
    <aside className="space-y-2 border-b bg-muted/30 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">C03 · Review</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · changes reset on reload
        </span>
        {(['details', 'locations'] as const).map((id) => (
          <Button key={id} asChild variant={layout === id ? 'secondary' : 'ghost'}>
            <a target="_top" href={`/design/x/contact-business-detail/${id}/s/contacts/business`}>
              {id === 'details' ? 'Details first' : 'Locations first'}
            </a>
          </Button>
        ))}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Proposals and questions</summary>
        <div className="space-y-2 pb-2 text-sm">
          <p>
            Details first groups global contact methods, websites and people before locations.
            Locations first groups people and arrangements under their location, with unassigned
            people and global details below. Both use the same facts and edit controls.
          </p>
          <p>
            Which grouping makes reaching the right person easiest? Is the optional location
            association clear? Are recorded arrangements distinct from editable contact facts?
          </p>
          <p>
            Names, kinds, notes, methods, websites, addresses, roles, contact associations and
            arrangement dates/status are fictional source facts. Initials, grouping and
            unavailable-reference findings are deterministic. Purchased arrangements have solid
            outlines; Reserved and Considering have dashed outlines. Dates and arrangements are
            read-only. No booking confirmation, network, persistence, import, geocoding or generated
            text. A person association selects an existing contact; it does not create one. Undo
            restores every local edit.
          </p>
        </div>
      </details>
    </aside>
  );
}
