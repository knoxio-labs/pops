import { Badge, Button } from '@pops/ui';

/** Separates comparison and fictional provenance from the event's contact-selection controls. */
export function PickerReview({ layout }: { layout: 'inline' | 'dialog' }) {
  return (
    <aside className="space-y-2 border-b border-border bg-muted/30 px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">C06 · Review</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · local changes reset on reload
        </span>
        {(['inline', 'dialog'] as const).map((id) => (
          <Button
            key={id}
            asChild
            variant={layout === id ? 'secondary' : 'ghost'}
            className="min-h-11 text-sm"
          >
            <a target="_top" href={`/design/x/contact-picker/${id}/s/contacts/picker`}>
              {id === 'inline' ? 'Inline picker' : 'Dialog picker'}
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
            Inline selection stays within Contacts. Dialog selection overlays the same event draft.
            Both use the same directory, complete source kinds, search, selection controls and
            contact editor fields.
          </p>
          <p>
            Contacts and event facts are fictional source data. Same-name identities remain
            separate. Links use source IDs; unavailable links remain removable. Create and link
            validates the new contact and adds it locally in one action. Dismissal retains the event
            and contact drafts; Cancel discards only the new contact draft. Undo restores
            contact/link changes while retaining event edits. No network, persistence, import,
            inferred contact facts or automatic matching.
          </p>
        </div>
      </details>
    </aside>
  );
}
