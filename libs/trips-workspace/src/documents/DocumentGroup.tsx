import { FileText, Trash2 } from 'lucide-react';

import { Button } from '@pops/ui';

import { paperlessOriginalUrl } from './api';

import type { ReactElement } from 'react';

import type { TripDocumentAssociation, PaperlessDocument } from './types';

/** Render target links with a level-three heading when nested beneath a visit; unlink never deletes originals. */
export function DocumentGroup({
  title,
  headingLevel = 2,
  associations,
  originals,
  allAssociations,
  onUnlink,
  busy,
}: {
  title: string;
  headingLevel?: 2 | 3;
  associations: readonly TripDocumentAssociation[];
  originals: readonly { document: PaperlessDocument | undefined; failed: boolean }[];
  allAssociations: readonly TripDocumentAssociation[];
  onUnlink: (id: number) => void;
  busy: boolean;
}): ReactElement | null {
  if (associations.length === 0) return null;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <Heading className={headingLevel === 2 ? 'text-lg font-medium' : 'text-base font-medium'}>
        {title}
      </Heading>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {associations.map((association) => (
          <DocumentRow
            key={association.id}
            association={association}
            query={originals[allAssociations.findIndex((entry) => entry.id === association.id)]}
            onUnlink={onUnlink}
            busy={busy}
          />
        ))}
      </ul>
    </section>
  );
}

function DocumentRow({
  association,
  query,
  onUnlink,
  busy,
}: {
  association: TripDocumentAssociation;
  query: { document: PaperlessDocument | undefined; failed: boolean } | undefined;
  onUnlink: (id: number) => void;
  busy: boolean;
}): ReactElement {
  const document = query?.document;
  return (
    <li className="flex items-center gap-3 p-3">
      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <DocumentDetails
          document={document}
          failed={query?.failed ?? false}
          id={association.documentId}
        />
      </div>
      {document ? (
        <a
          className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          href={paperlessOriginalUrl(document.id)}
          target="_blank"
          rel="noreferrer"
        >
          Open original
        </a>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Unlink ${document?.title ?? `Documents ${String(association.documentId)}`}`}
        disabled={busy}
        onClick={() => onUnlink(association.id)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}

function DocumentDetails({
  document,
  failed,
  id,
}: {
  document: PaperlessDocument | undefined;
  failed: boolean;
  id: number;
}): ReactElement {
  if (document !== undefined) {
    return (
      <>
        <p className="truncate text-sm font-medium">{document.title}</p>
        <p className="truncate text-xs text-muted-foreground">{document.originalFileName}</p>
      </>
    );
  }
  if (failed) {
    return (
      <p className="text-sm text-muted-foreground">
        Original unavailable · Documents ID {String(id)}
      </p>
    );
  }
  return <p className="text-sm text-muted-foreground">Resolving original…</p>;
}
