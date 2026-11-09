import { CircleAlert, Cloud, CloudOff, Download, RefreshCw } from 'lucide-react';

import { Badge } from '@pops/ui';

import { filePresentation } from '../trip-quick-capture/file-chips';

import type { DocumentRow } from './model';

/** Render the source MIME icon without synthesizing a browser File. */
export function DocumentTypeIcon({ row }: { row: DocumentRow }) {
  const { Icon, label } = filePresentation(row.document?.mimeType.toLowerCase() ?? '');
  return <Icon role="img" aria-label={label} className="size-5 shrink-0 text-app-accent" />;
}

/** Separate source reachability from an explicitly recorded offline copy state. */
export function DocumentAvailability({ row }: { row: DocumentRow }) {
  const available = row.document?.availability;
  const SourceIcon = available === 'available' ? Cloud : CloudOff;
  const offline = row.offline;
  const icons = {
    ready: Download,
    'not-downloaded': CircleAlert,
    stale: RefreshCw,
    failed: CircleAlert,
  };
  const OfflineIcon = offline ? icons[offline.status] : CircleAlert;
  const sourceLabel = available ? `Source ${available}` : 'Document unavailable';
  const labels = {
    ready: 'Offline ready',
    'not-downloaded': 'Not downloaded',
    stale: 'Offline copy stale',
    failed: 'Offline copy failed',
  };
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      <Badge variant="outline" className="gap-1 font-normal">
        <SourceIcon className="size-3" />
        {sourceLabel}
      </Badge>
      {offline && (
        <Badge variant="outline" className="gap-1 font-normal">
          <OfflineIcon className="size-3" />
          {labels[offline.status]}
        </Badge>
      )}
    </span>
  );
}
