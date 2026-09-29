import { CircleCheck, CircleDashed, CircleX, LoaderCircle } from 'lucide-react';

import { Button, cn } from '@pops/ui';

import { OFFLINE_REASON } from '../../foundation/feedback/state-banner.js';
import { useOnline } from '../../inventory-web/useOnline.js';
import { usePaperlessStatus } from '../../inventory-web/usePaperlessStatus.js';

import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import type { PaperlessStatusResult } from '../../inventory-web/usePaperlessStatus.js';

/** The state the Paperless settings widget can show after a status read. */
export type PaperlessWidgetState =
  | { kind: 'not-set-up' }
  | { kind: 'testing'; url: string | null }
  | { kind: 'connected'; url: string; documents: number; checked: string }
  | { kind: 'unreachable'; url: string; checked: string };

function checkedLabel(checkedAt: Date): string {
  return `today at ${checkedAt.toLocaleTimeString('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

/** Maps the shared Paperless status query to the widget state and copy inputs. */
export function paperlessWidgetState(
  status: PaperlessStatusResult | null,
  testing: boolean,
  checkedAt: Date
): PaperlessWidgetState | null {
  if (status === null) return testing ? { kind: 'testing', url: null } : null;
  if (!status.configured) return { kind: 'not-set-up' };
  if (testing) return { kind: 'testing', url: status.baseUrl };
  if (status.available) {
    return {
      kind: 'connected',
      url: status.baseUrl ?? '',
      documents: status.documentCount ?? 0,
      checked: checkedLabel(checkedAt),
    };
  }
  return {
    kind: 'unreachable',
    url: status.baseUrl ?? '',
    checked: checkedLabel(checkedAt),
  };
}

function statusLine(status: PaperlessWidgetState): {
  icon: LucideIcon;
  tone: string;
  title: string;
  detail: string;
} {
  switch (status.kind) {
    case 'not-set-up':
      return {
        icon: CircleDashed,
        tone: 'text-muted-foreground',
        title: 'Not set up',
        detail: 'Items can hold documents once Paperless is connected.',
      };
    case 'testing':
      return {
        icon: LoaderCircle,
        tone: 'text-muted-foreground motion-safe:animate-spin',
        title: 'Testing the connection',
        detail: status.url
          ? `Asking ${status.url} for its document count.`
          : 'Asking Paperless for its document count.',
      };
    case 'connected':
      return {
        icon: CircleCheck,
        tone: 'text-success',
        title: `Connected, ${status.documents.toLocaleString('en-AU')} documents`,
        detail: `Checked ${status.checked}.`,
      };
    case 'unreachable':
      return {
        icon: CircleX,
        tone: 'text-warning',
        title: 'Paperless unreachable',
        detail: `Checked ${status.checked}. Documents show as unavailable until it answers.`,
      };
  }
}

/** Renders the shared Paperless status query without exposing its token. */
export function PaperlessWidget(): ReactElement | null {
  const query = usePaperlessStatus();
  const offline = !useOnline();
  const status = paperlessWidgetState(
    query.data ?? null,
    query.isFetching,
    new Date(query.dataUpdatedAt)
  );
  if (status === null) return null;

  const line = statusLine(status);
  const Icon = line.icon;
  const tokenStored = query.data?.configured === true;

  return (
    <div className="flex items-start gap-3 rounded-md bg-muted/50 px-3 py-2" role="status">
      <Icon className={cn('mt-0.5 size-4 shrink-0', line.tone)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{line.title}</p>
        <p className="text-xs text-muted-foreground">{line.detail}</p>
        {query.data ? (
          <p className="text-xs text-muted-foreground">
            {tokenStored
              ? 'An API token is stored on the server. It is never shown here.'
              : 'No API token stored yet. Add one on the server; it is never shown here.'}
          </p>
        ) : null}
      </div>
      {query.data === undefined || status.kind === 'not-set-up' ? null : (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={status.kind === 'testing' || offline}
          title={offline ? OFFLINE_REASON : undefined}
          onClick={() => void query.refetch()}
        >
          {status.kind === 'testing' ? 'Testing' : 'Test connection'}
        </Button>
      )}
    </div>
  );
}
