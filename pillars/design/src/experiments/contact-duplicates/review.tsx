import { Badge, Button } from '@pops/ui';

/** Keeps comparison details and preview-only provenance outside the product surface. */
export function DuplicateReview({ layout }: { layout: 'sources' | 'fields' }) {
  return (
    <aside className="space-y-2 border-b border-border bg-muted/30 px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">C05 · Review</Badge>
        <span className="text-xs text-muted-foreground">Fictional data · preview only</span>
        {(['sources', 'fields'] as const).map((id) => (
          <Button
            key={id}
            asChild
            variant={layout === id ? 'secondary' : 'ghost'}
            className="min-h-11 text-sm"
          >
            <a target="_top" href={`/design/x/contact-duplicates/${id}/s/contacts/duplicates`}>
              {id === 'sources' ? 'Sources first' : 'Fields first'}
            </a>
          </Button>
        ))}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">
          Comparison and provenance
        </summary>
        <div className="space-y-2 pb-2 text-sm text-muted-foreground">
          <p>
            Sources first presents both complete source records before field choices. Fields first
            starts with independent retained-contact, name and type choices, then combined facts;
            source records remain available below.
          </p>
          <p>
            Both proposals use the same fictional records and selections. Every nonblank optional
            fact retains its source label. Same names are separate identities, not evidence that a
            merge is correct. Preview projects a result and reference targets without writing,
            merging or deleting records. Keep separate dismisses only this local pair; Undo restores
            it. No matching, confidence score, network or persistence.
          </p>
        </div>
      </details>
    </aside>
  );
}
