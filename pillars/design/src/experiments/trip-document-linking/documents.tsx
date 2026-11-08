import { Check, File, Image, Paperclip, CircleAlert } from 'lucide-react';

import { Button, Chip, formatBytes } from '@pops/ui';

import { useDocuments } from './context';
import { toggleDocumentSelection, unlinkDocument } from './model';

import type { DocumentRecord } from './model';

function DocumentIcon({ document }: { document: DocumentRecord }) {
  const Icon = document.mimeType.startsWith('image/') ? Image : File;
  return <Icon className="size-4 shrink-0 text-app-accent" aria-hidden />;
}

/** Show each source document with its own availability and explicit selection state. */
export function DocumentResult({ document }: { document: DocumentRecord }) {
  const { state, change } = useDocuments();
  const linked = state.links.some(
    (link) => link.documentId === document.id && link.targetId === state.targetId
  );
  const selected = state.selectedIds.includes(document.id);
  return (
    <Button
      variant="ghost"
      className="h-auto min-h-11 w-full justify-start gap-3 rounded-lg border border-foreground/25 px-3 py-3 text-left"
      aria-pressed={selected}
      disabled={document.availability === 'unavailable' || linked}
      onClick={() => change(toggleDocumentSelection(state, document.id))}
    >
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded border ${selected ? 'border-app-accent bg-app-accent text-app-accent-foreground' : 'border-foreground/30'}`}
      >
        {selected && <Check className="size-4" />}
      </span>
      <DocumentIcon document={document} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{document.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {document.fileName} · {formatBytes(document.size)}
        </span>
      </span>
      {linked && <span className="text-xs">Linked</span>}
      {document.availability === 'unavailable' && <span className="text-xs">Unavailable</span>}
    </Button>
  );
}

/** Remove an association while retaining the original document and all its other links. */
export function LinkedDocuments() {
  const { state, change } = useDocuments();
  const links = state.links.filter((link) => link.targetId === state.targetId);
  return (
    <section aria-label="Linked documents" className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Paperclip className="size-4 text-app-accent" />
        Documents <span className="text-muted-foreground">{links.length}</span>
      </h2>
      <div className="flex flex-wrap gap-2">
        {links.map((link) => {
          const document = state.documents.find((item) => item.id === link.documentId);
          return (
            <Chip
              key={link.id}
              variant="outline"
              className="min-h-11 max-w-full border-foreground/30 px-3 text-sm"
              prefix={
                document ? (
                  <DocumentIcon document={document} />
                ) : (
                  <CircleAlert className="size-4 text-warning" />
                )
              }
              removable
              removeLabel={`Unlink ${document?.title ?? 'unavailable document'}`}
              onRemove={() => change(unlinkDocument(state, link.id))}
            >
              {document?.title ?? 'Document unavailable'}
              {document?.availability === 'unavailable' ? ' · unavailable' : ''}
            </Chip>
          );
        })}
      </div>
    </section>
  );
}
