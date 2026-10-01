import { FileText, Link2 } from 'lucide-react';

import { Button, formatDate } from '@pops/ui';

/** A document returned by Paperless search. */
export interface PaperlessDocResult {
  id: number;
  title: string;
  created: string;
  originalFileName: string;
  thumbnailUrl: string;
}

interface PaperlessDocumentResultRowProps {
  doc: PaperlessDocResult;
  linkingId: number | null;
  isPending: boolean;
  onLink: (doc: PaperlessDocResult) => void;
}

/** Renders a Paperless result and reports when the user selects it. */
export function PaperlessDocumentResultRow({
  doc,
  linkingId,
  isPending,
  onLink,
}: PaperlessDocumentResultRowProps) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-md hover:bg-accent transition-colors">
      {doc.thumbnailUrl ? (
        <img src={doc.thumbnailUrl} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
      ) : (
        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{doc.title}</div>
        <div className="text-xs text-muted-foreground">
          {doc.created ? formatDate(doc.created) : 'No date'}
          {doc.originalFileName ? ` · ${doc.originalFileName}` : ''}
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={() => onLink(doc)} disabled={isPending}>
        {linkingId === doc.id ? (
          <span className="text-xs">Linking...</span>
        ) : (
          <Link2 className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
