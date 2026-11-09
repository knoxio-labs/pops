import { Card, formatBytes } from '@pops/ui';

import { useTripDocuments } from './context';
import { documentOccurrences, groupDocumentOccurrences } from './model';
import { DocumentAvailability, DocumentTypeIcon } from './presentation';
import { DocumentSource } from './source';

import type { DocumentRow } from './model';

function DocumentItem({ row, target }: { row: DocumentRow; target?: string }) {
  const { state } = useTripDocuments();
  const sameFileName =
    row.document &&
    state.linking.documents.some(
      (document) => document.id !== row.id && document.fileName === row.document?.fileName
    );
  return (
    <article>
      <DocumentSource row={row}>
        <span className="flex items-start gap-3">
          <DocumentTypeIcon row={row} />
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block text-sm font-medium">{row.title}</span>
            {row.document?.fileName && (row.document.fileName !== row.title || sameFileName) && (
              <span className="block truncate text-xs text-muted-foreground">
                {row.document.fileName}
                {sameFileName ? ` · ${formatBytes(row.document.size)}` : ''}
              </span>
            )}
            {target && <span className="block text-xs">{target}</span>}
            <DocumentAvailability row={row} />
          </span>
        </span>
      </DocumentSource>
    </article>
  );
}

/** Project originals once or repeat their explicit associations in route order. */
export function DocumentResults({
  rows,
  layout,
}: {
  rows: DocumentRow[];
  layout: 'route' | 'documents';
}) {
  const { state } = useTripDocuments();
  if (!rows.length)
    return <p className="py-6 text-sm text-muted-foreground">No matching documents</p>;
  if (layout === 'documents')
    return (
      <Card className="gap-0 divide-y divide-border overflow-hidden border-border py-0">
        {rows.map((row) => (
          <DocumentItem
            key={row.id}
            row={row}
            target={row.links
              .map(
                (link) =>
                  state.linking.targets.find((target) => target.id === link.targetId)?.label ??
                  'Linked item unavailable'
              )
              .join(' · ')}
          />
        ))}
      </Card>
    );
  const groups = groupDocumentOccurrences(state, documentOccurrences(state, rows));
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.id} className="space-y-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {group.name}
            <span className="text-xs font-normal text-muted-foreground">
              {group.occurrences.length}
            </span>
          </h2>
          <Card className="gap-0 divide-y divide-border overflow-hidden border-border py-0">
            {group.occurrences.map((item) => (
              <DocumentItem key={item.id} row={item.row} target={item.target?.label} />
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}
