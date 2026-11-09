import { Badge, Button } from '@pops/ui';

/** Keep comparison questions and source provenance outside the product Inbox. */
export function InboxReview({ layout }: { layout: 'inline' | 'dialog' }) {
  return (
    <aside className="space-y-2 border-b border-border bg-muted/30 px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">T11 · Review</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · changes reset on reload
        </span>
        {(['inline', 'dialog'] as const).map((id) => (
          <Button key={id} asChild variant={id === layout ? 'secondary' : 'ghost'}>
            <a target="_top" href={`/design/x/trip-inbox/${id}/s/trips/inbox`}>
              {id === 'inline' ? 'Inline organisation' : 'Open item'}
            </a>
          </Button>
        ))}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Proposals and questions</summary>
        <div className="space-y-2 pb-2 text-sm">
          <p>
            Inline organisation expands one source beside the other captured items. Open item uses a
            dialog for the same source and actions.
          </p>
          <p>Which approach makes organising captured material easier?</p>
          <p>
            Capture text or actual local files, link to an existing trip item, or explicitly create
            a new item. The raw source is preserved. Only a valid association marks a source
            organised; classification alone does not. Unlink removes one association and preserves
            both the capture and target. Undo restores local changes. No upload, extraction or
            inferred planning fields are simulated.
          </p>
        </div>
      </details>
    </aside>
  );
}
