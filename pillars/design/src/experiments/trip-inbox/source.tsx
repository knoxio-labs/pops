import { ExternalLink, Link2, Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@pops/ui';

import { shortArrangementDates } from '../trip-arrangements/format';
import { CaptureFileChips } from '../trip-quick-capture/file-chips';
import { safeCaptureLink } from '../trip-quick-capture/model';
import { InboxAssociations, LinkInboxTarget } from './associations';
import { useInbox } from './context';
import { CreateInboxTarget } from './create';
import { inboxTargetLabel } from './model';

import type { InboxRow } from './model';

function RawSource({ row }: { row: InboxRow }) {
  const { state } = useInbox();
  const source = row.source;
  if (!source) return null;
  const url = safeCaptureLink(source.url);
  const visit = state.targets.find((target) => target.id === source.visitId);
  return (
    <section
      aria-label="Raw source"
      className="space-y-3 rounded-lg border border-border bg-muted/30 p-3"
    >
      <h3 className="text-xs font-medium text-muted-foreground">Raw source</h3>
      {source.title && <p className="text-sm font-medium">{source.title}</p>}
      {source.text && <p className="whitespace-pre-wrap break-words text-sm">{source.text}</p>}
      {source.url && (
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 break-all text-sm">{source.url}</p>
          {url && (
            <Button asChild variant="ghost" size="icon" aria-label="Open source link">
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
              </a>
            </Button>
          )}
        </div>
      )}
      <CaptureFileChips files={source.files} />
      {source.visitId && (
        <p className="text-xs">
          Captured visit · {visit ? inboxTargetLabel(state, visit) : 'Visit unavailable'}
        </p>
      )}
      {(source.start || source.end) && (
        <p className="text-xs">
          {shortArrangementDates([source.start, source.end].filter(Boolean))}
        </p>
      )}
    </section>
  );
}

/** Preserve verbatim captured material beside explicit existing-target and new-item actions. */
export function InboxSource({ row }: { row: InboxRow }) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  return (
    <div className="space-y-4">
      <RawSource row={row} />
      {row.findings.map((finding) => (
        <p key={finding.id} role="alert" className="text-sm text-destructive">
          {finding.message}
        </p>
      ))}
      <InboxAssociations row={row} />
      {row.source && (
        <section aria-label="Organise source" className="space-y-3">
          <div className="flex flex-wrap gap-1">
            <Button
              variant={mode === 'existing' ? 'secondary' : 'ghost'}
              aria-pressed={mode === 'existing'}
              onClick={() => setMode('existing')}
            >
              <Link2 className="size-4" />
              Link existing
            </Button>
            <Button
              variant={mode === 'new' ? 'secondary' : 'ghost'}
              aria-pressed={mode === 'new'}
              onClick={() => setMode('new')}
            >
              <Plus className="size-4" />
              New item
            </Button>
          </div>
          {mode === 'existing' ? <LinkInboxTarget row={row} /> : <CreateInboxTarget row={row} />}
        </section>
      )}
    </div>
  );
}
