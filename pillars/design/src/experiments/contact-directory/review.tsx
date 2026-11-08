import { Badge, Button } from '@pops/ui';

/** Review metadata explains the alternative grouping without adding prose to the directory. */
export function DirectoryReview({ layout }: { layout: 'combined' | 'grouped' }) {
  return (
    <aside className="space-y-2 border-b bg-muted/30 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">C01 · Review</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · changes reset on reload
        </span>
        {(['combined', 'grouped'] as const).map((id) => (
          <Button key={id} asChild variant={layout === id ? 'secondary' : 'ghost'}>
            <a target="_top" href={`/design/x/contact-directory/${id}/s/contacts/directory`}>
              {id === 'combined' ? 'One list' : 'By type'}
            </a>
          </Button>
        ))}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Proposals and questions</summary>
        <div className="space-y-2 pb-2 text-sm">
          <p>
            One list sorts matching contacts by name. By type separates the same results into
            vertical sections using the existing entity taxonomy. Both preserve finance entities,
            use the same filters and expand details in place.
          </p>
          <ol className="list-decimal pl-5">
            <li>One alphabetical list or sections by type?</li>
            <li>Is the information visible before expanding enough to find the right record?</li>
          </ol>
          <p>
            Try an alias, email or accented city; combine filters, expand details, copy a method,
            create a contact and Undo. Duplicate names remain separate identities; creation never
            merges existing records. Existing finance entity types and fields are retained.
          </p>
          <p>
            Names, aliases, methods, addresses, notes, origin and types are source facts. Counts,
            search matching, initials and ordering are deterministic. City choices come only from
            recorded addresses. New contacts require an explicit name/type and start with no contact
            facts. No network, import, deduplication, booking or LLM call. Detailed create/edit and
            duplicate resolution remain separate prototypes.
          </p>
        </div>
      </details>
    </aside>
  );
}
