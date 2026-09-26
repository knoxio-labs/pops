/**
 * Paperless documents linked to the item. When Paperless is down or not
 * connected the section stays: titles remain, every action dims with the
 * reason, and one line says what is wrong. A document deleted in Paperless
 * since it was linked says so on its row and offers Unlink.
 */
import { ExternalLink, FileText, Link2, Unlink } from 'lucide-react';

import { PaperlessNotice, paperlessReason } from '../documents/paperless-notice';
import { RowVerb } from '../foundation';
import { EmptyLine } from './section-parts';
import { VerbButton } from './verb-button';

import type { DetailDocument, PaperlessState } from './detail-model';

/** One line for a folded section header. */
export function documentsSummary(
  docs: readonly DetailDocument[],
  paperless: PaperlessState
): string {
  if (paperless === 'unreachable') return 'Paperless is unreachable';
  if (paperless === 'not-configured') return 'Paperless is not connected';
  if (docs.length === 0) return 'No documents linked';
  const missing = docs.filter((doc) => doc.missing === true).length;
  const kinds = [...new Set(docs.map((doc) => doc.kind))].join(', ');
  return missing > 0 ? `${kinds}. ${missing} deleted in Paperless` : kinds;
}

function DocumentRow({
  doc,
  refusal,
  readOnly,
}: {
  doc: DetailDocument;
  refusal?: string;
  readOnly: boolean;
}) {
  return (
    <li className="group flex min-h-11 items-center gap-3 px-2">
      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={
            doc.missing ? 'truncate text-sm text-muted-foreground line-through' : 'truncate text-sm'
          }
        >
          {doc.title}
        </span>
        <span className="text-xs text-muted-foreground">
          {doc.missing
            ? 'Deleted in Paperless. Unlink it to tidy up.'
            : `${doc.kind}, linked ${doc.added}`}
        </span>
      </span>
      {doc.missing || readOnly ? null : (
        <RowVerb
          icon={ExternalLink}
          label={`Open ${doc.title} in Paperless`}
          disabledReason={refusal}
        />
      )}
      {readOnly ? null : (
        <span
          className={
            doc.missing
              ? undefined
              : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
          }
        >
          <RowVerb
            icon={Unlink}
            label={`Unlink ${doc.title}`}
            disabledReason={doc.missing ? undefined : refusal}
          />
        </span>
      )}
    </li>
  );
}

/** The documents block. */
export function DocumentsSection({
  documents,
  paperless,
  readOnly = false,
}: {
  documents: readonly DetailDocument[];
  paperless: PaperlessState;
  readOnly?: boolean;
}) {
  const outage = paperless === 'connected' ? null : paperless;
  const refusal = outage === null ? undefined : paperlessReason(outage);
  return (
    <div className="flex flex-col gap-1">
      {outage ? <PaperlessNotice outage={outage} /> : null}
      {documents.length === 0 ? (
        <EmptyLine icon={FileText} text="No documents linked." />
      ) : (
        <ul aria-label="Documents" className="divide-y divide-border/60">
          {documents.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} refusal={refusal} readOnly={readOnly} />
          ))}
        </ul>
      )}
      {readOnly ? null : (
        <VerbButton
          label="Link a document"
          icon={Link2}
          variant="ghost"
          disabledReason={refusal}
          className="self-start"
        />
      )}
    </div>
  );
}
