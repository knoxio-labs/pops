import { FileText, Link2 } from 'lucide-react';
import { useState } from 'react';

import { Button, formatDate, SearchPickerDialog, Select } from '@pops/ui';

export interface PaperlessDocResult {
  id: number;
  title: string;
  created: string;
  originalFileName: string;
  thumbnailUrl: string;
}

const DOCUMENT_TYPES = ['receipt', 'warranty', 'manual', 'invoice', 'other'] as const;

type DocType = (typeof DOCUMENT_TYPES)[number];

export interface LinkDocumentInput {
  itemId: string;
  paperlessDocumentId: number;
  documentType: DocType;
  title: string;
}

export interface LinkDocumentDialogProps {
  itemId: string;
  /** Paperless search results for the dialog's current search text. */
  results: PaperlessDocResult[];
  /** Whether the search is in flight. */
  isLoading: boolean;
  /**
   * Search failure message, if the last search errored. Shown in place of
   * the results list's usual "No results found" text, since the dialog has
   * no other slot for it.
   */
  error?: string | null;
  /** Search text and its setter; the parent owns the debounce/query. */
  search: string;
  onSearchChange: (value: string) => void;
  /** Called when a result's link button is pressed. */
  onLink: (input: LinkDocumentInput) => void;
  /** The id currently being linked, or null when no link is in flight. */
  linkingId: number | null;
  /** Whether a link request is pending (disables every result's button). */
  isLinking?: boolean;
  /**
   * Starts the dialog open. The app has no such prop: it exists because the
   * canvas renders a state once and cannot press anything, so a design state
   * showing the dialog needs a way in that is not a click.
   */
  defaultOpen?: boolean;
}

interface DocumentResultRowProps {
  doc: PaperlessDocResult;
  linkingId: number | null;
  isPending: boolean;
  onLink: (doc: PaperlessDocResult) => void;
}

function DocumentResultRow({ doc, linkingId, isPending, onLink }: DocumentResultRowProps) {
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

const DOC_TYPE_OPTIONS = DOCUMENT_TYPES.map((t) => ({
  value: t,
  label: t.charAt(0).toUpperCase() + t.slice(1),
}));

const TRIGGER = (
  <Button variant="outline" size="sm">
    <FileText className="h-4 w-4 mr-1.5" />
    Link Document
  </Button>
);

function DocTypeSelect({
  docType,
  setDocType,
}: {
  docType: DocType;
  setDocType: (v: DocType) => void;
}) {
  return (
    <Select
      value={docType}
      onChange={(e) => setDocType(e.target.value as DocType)}
      size="sm"
      options={DOC_TYPE_OPTIONS}
    />
  );
}

export function LinkDocumentDialog({
  itemId,
  results,
  isLoading,
  error = null,
  search,
  onSearchChange,
  onLink,
  linkingId,
  isLinking = false,
  defaultOpen = false,
}: LinkDocumentDialogProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [docType, setDocType] = useState<DocType>('receipt');

  return (
    <SearchPickerDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) onSearchChange('');
      }}
      trigger={TRIGGER}
      title="Link Document"
      description="Search Paperless-ngx for a document to link to this item."
      searchPlaceholder="Search documents..."
      search={search}
      onSearchChange={onSearchChange}
      isLoading={isLoading}
      results={results}
      getResultKey={(doc: PaperlessDocResult) => doc.id}
      maxResultsHeight="max-h-72"
      emptyMessage={error ?? undefined}
      trailing={<DocTypeSelect docType={docType} setDocType={setDocType} />}
      renderResult={(doc: PaperlessDocResult) => (
        <DocumentResultRow
          doc={doc}
          linkingId={linkingId}
          isPending={isLinking}
          onLink={(d) =>
            onLink({
              itemId,
              paperlessDocumentId: d.id,
              documentType: docType,
              title: d.title,
            })
          }
        />
      )}
    />
  );
}
