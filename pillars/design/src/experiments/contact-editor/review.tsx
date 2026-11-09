import { Badge, Button } from '@pops/ui';

/** Separates the comparison and fictional source provenance from the contact form. */
export function ContactEditorReview({ layout }: { layout: 'full' | 'progressive' }) {
  return (
    <aside className="space-y-2 border-b border-border bg-muted/30 px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">C04 · Review</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · local changes reset on reload
        </span>
        {(['full', 'progressive'] as const).map((id) => (
          <Button
            key={id}
            asChild
            variant={layout === id ? 'secondary' : 'ghost'}
            className="min-h-11 text-sm"
          >
            <a target="_top" href={`/design/x/contact-editor/${id}/s/contacts/edit`}>
              {id === 'full' ? 'All fields' : 'Add as needed'}
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
            Both proposals use the same contact facts, source types and draft controls. All fields
            exposes optional sections immediately. Add as needed reveals them within the same form
            and opens populated sections when editing.
          </p>
          <p>
            Names, aliases, types, methods, partial addresses and notes are fictional source facts.
            Only name and type are required. Labels and values remain free text; duplicate names
            remain separate identities. Save updates local records, Cancel discards the draft, and
            Undo restores the last saved state. No network, persistence, inference or generated
            contact facts.
          </p>
        </div>
      </details>
    </aside>
  );
}
