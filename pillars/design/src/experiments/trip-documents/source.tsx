import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  formatBytes,
} from '@pops/ui';

import { calendarStamp } from '../trip-calendar/format';
import { DocumentAssociations } from './associations';
import { useTripDocuments } from './context';
import { sourceRow, tripDocumentFindings } from './model';
import { DocumentAvailability, DocumentTypeIcon } from './presentation';

import type { DocumentRow } from './model';

function SourceMetadata({ row }: { row: DocumentRow }) {
  return (
    <div className="space-y-4">
      {row.document && (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">File type</dt>
            <dd>{row.document.mimeType}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Size</dt>
            <dd>{formatBytes(row.document.size)}</dd>
          </div>
        </dl>
      )}
      {row.provenance && (
        <section className="space-y-1 text-sm">
          <h3 className="text-xs text-muted-foreground">Source</h3>
          <p>{row.provenance.source}</p>
          {row.provenance.url && <p className="break-all">{row.provenance.url}</p>}
        </section>
      )}
      {row.offline && (
        <section className="space-y-1 text-sm">
          <h3 className="text-xs text-muted-foreground">Offline record</h3>
          <p>{row.offline.source}</p>
          {row.offline.detail && <p>{row.offline.detail}</p>}
          {row.offline.recordedAt && <p>Recorded {calendarStamp(row.offline.recordedAt, 'UTC')}</p>}
        </section>
      )}
    </div>
  );
}

/** Open the selected original without tying its dialog lifetime to a route occurrence. */
export function DocumentSource({ row, children }: { row: DocumentRow; children: React.ReactNode }) {
  const { select } = useTripDocuments();
  return (
    <Button
      variant="ghost"
      aria-label={`Open ${row.title}`}
      aria-description={
        row.document ? `${row.document.fileName} · ${formatBytes(row.document.size)}` : undefined
      }
      className="block h-auto min-h-11 w-full cursor-pointer whitespace-normal rounded-none p-3 text-left font-normal hover:bg-muted focus-visible:ring-inset"
      onClick={() => select(row.id)}
    >
      {children}
    </Button>
  );
}

/** Show the live selected source even after its last association or visible occurrence disappears. */
export function DocumentDialog() {
  const { state, selectedId, select } = useTripDocuments();
  const current = selectedId ? sourceRow(state, selectedId) : null;
  return (
    <Dialog
      open={Boolean(current)}
      onOpenChange={(open) => {
        if (!open) select(null);
      }}
    >
      {current && (
        <DialogContent className="max-h-full overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <DocumentTypeIcon row={current} />
              {current.title}
            </DialogTitle>
            <DialogDescription>
              {current.document?.fileName ?? 'Document unavailable'}
            </DialogDescription>
          </DialogHeader>
          <DocumentAvailability row={current} />
          <SourceMetadata row={current} />
          {tripDocumentFindings(state, current).map((finding) => (
            <p key={finding.id} role="alert" className="text-sm text-destructive">
              {finding.message}
            </p>
          ))}
          <DocumentAssociations key={current.id} row={current} />
        </DialogContent>
      )}
    </Dialog>
  );
}
