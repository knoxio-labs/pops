import { Badge, Button } from '@pops/ui';

/** Review-only proposals and source contracts stay outside the product capture surface. */
export function DocumentReview({ layout }: { layout: 'inline' | 'picker' }) {
  return (
    <aside className="space-y-2 border-b bg-muted/30 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">D09 · Review</Badge>
        <span className="text-xs text-muted-foreground">
          Fictional data · changes reset on reload
        </span>
        {(['inline', 'picker'] as const).map((id) => (
          <Button key={id} asChild variant={layout === id ? 'secondary' : 'ghost'}>
            <a target="_top" href={`/design/x/trip-document-linking/${id}/s/trips/document-link`}>
              {id === 'inline' ? 'Inline' : 'Picker'}
            </a>
          </Button>
        ))}
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Proposals and questions</summary>
        <div className="space-y-2 pb-2 text-sm">
          <p>
            Inline shows the searchable Documents catalogue in context. Picker opens the same
            catalogue in a dialog; selection stays available when it closes. Both link multiple
            existing originals to an explicit trip, visit or arrangement.
          </p>
          <ol className="list-decimal pl-5">
            <li>Keep the catalogue visible or open it when needed?</li>
            <li>Are linking an existing original and choosing new files clear?</li>
          </ol>
          <p>
            Try searching, linking the same document to another item, unlinking, Undo and choosing
            multiple files. Unlink removes only that association. Unavailable originals keep
            existing links but cannot be newly selected.
          </p>
          <p>
            Titles, filenames, MIME types, sizes, availability and targets come from typed fictional
            source data. Search, counts and state labels are deterministic. Actual browser File
            objects stay local and are marked not uploaded. No upload, document extraction, booking
            confirmation, offline download or LLM call is simulated. Documents retains ownership of
            originals.
          </p>
        </div>
      </details>
    </aside>
  );
}
