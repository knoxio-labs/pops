import { Badge, Button } from '@pops/ui';

/** Keep proposal comparison and fixture provenance outside the product surface. */
export function TripDocumentsReview({ layout }: { layout: 'route' | 'documents' }) {
  return (
    <aside className="space-y-2 border-b border-border bg-muted/30 px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">T10 · Review</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · changes reset on reload
        </span>
        {(['route', 'documents'] as const).map((id) => (
          <Button key={id} asChild variant={id === layout ? 'secondary' : 'ghost'}>
            <a target="_top" href={`/design/x/trip-documents/${id}/s/trips/documents`}>
              {id === 'route' ? 'By route' : 'By document'}
            </a>
          </Button>
        ))}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Proposals and questions</summary>
        <div className="space-y-2 pb-2 text-sm">
          <p>
            By route places explicit associations under their visits. By document shows each
            original once with its linked plans. Both retain the same sources and association
            controls.
          </p>
          <p>Which grouping makes it easier to find the document you need?</p>
          <p>
            Open an original, link or unlink one target, try Undo, and choose existing documents or
            local files. Originals and recorded offline facts are read-only. Selected browser files
            remain pending; no upload, download or offline synchronization is simulated.
          </p>
        </div>
      </details>
    </aside>
  );
}
