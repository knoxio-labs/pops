import { useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleDashed, CircleX, LoaderCircle } from 'lucide-react';

import { Button, cn } from '@pops/ui';

import { unwrap } from '../inventory-api-helpers.js';
import { paperlessStatus } from '../inventory-api/index.js';

import type { LucideIcon } from 'lucide-react';

import type { PaperlessStatusResponses } from '../inventory-api/types.gen.js';

type PaperlessData = PaperlessStatusResponses[200]['data'];

type PaperlessViewState =
  | { kind: 'not-set-up' }
  | { kind: 'testing'; url: string }
  | { kind: 'connected'; url: string; documents: number; checked: string }
  | { kind: 'unreachable'; url: string; reason: string; checked: string };

const QUERY_KEY = ['inventory', 'paperless', 'status'] as const;
const PAPERLESS_NAME = 'Paperless-ngx';

function viewState(data: PaperlessData | undefined, isFetching: boolean): PaperlessViewState {
  const url = data?.baseUrl ?? PAPERLESS_NAME;
  if (isFetching) return { kind: 'testing', url };
  if (data?.configured === true && data.available) {
    return {
      kind: 'connected',
      url,
      documents: data.documentCount ?? 0,
      checked: 'just now',
    };
  }
  if (data?.configured === false) return { kind: 'not-set-up' };
  return {
    kind: 'unreachable',
    url,
    reason: 'Inventory could not reach Paperless-ngx.',
    checked: 'just now',
  };
}

function statusLine(status: PaperlessViewState): {
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
        detail: 'Items can hold documents once Paperless is connected. Enter its address below.',
      };
    case 'testing':
      return {
        icon: LoaderCircle,
        tone: 'text-muted-foreground motion-safe:animate-spin',
        title: 'Testing the connection',
        detail: `Asking ${status.url} for its document count.`,
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
        detail: `${status.reason} Checked ${status.checked}. Documents show as unavailable until it answers.`,
      };
  }
}

/** Renders Paperless status and retries the live status check without exposing its token. */
export function PaperlessWidget() {
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => unwrap(await paperlessStatus()),
    refetchOnWindowFocus: false,
  });
  const data = query.data?.data;
  const status = viewState(data, query.isFetching);
  const line = statusLine(status);
  const Icon = line.icon;
  const tokenStored = data?.configured === true;

  return (
    <div className="flex items-start gap-3 rounded-md bg-muted/50 px-3 py-2" role="status">
      <Icon className={cn('mt-0.5 size-4 shrink-0', line.tone)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{line.title}</p>
        <p className="text-xs text-muted-foreground">{line.detail}</p>
        <p className="text-xs text-muted-foreground">
          {tokenStored
            ? 'An API token is stored on the server. It is never shown here.'
            : 'No API token stored yet. Add one on the server; it is never shown here.'}
        </p>
      </div>
      {status.kind === 'not-set-up' ? null : (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={status.kind === 'testing'}
          onClick={() => void query.refetch()}
        >
          {status.kind === 'testing' ? 'Testing' : 'Test connection'}
        </Button>
      )}
    </div>
  );
}
