/**
 * The `inventory-paperless` settings widget: what Paperless last answered
 * and Test connection, which asks the saved address again. The address is
 * the declarative field under it; the API token lives on the server and is
 * never sent to the page, so the widget only says whether one is stored.
 * While Paperless is down, item documents and report receipts stay listed
 * with their actions off.
 */
import { CircleCheck, CircleDashed, CircleX, LoaderCircle } from 'lucide-react';

import { Button, cn } from '@pops/ui';

import type { LucideIcon } from 'lucide-react';

/** What Paperless last answered. */
export type PaperlessStatus =
  | { kind: 'not-set-up' }
  | { kind: 'testing'; url: string }
  | { kind: 'connected'; url: string; documents: number; checked: string }
  | { kind: 'unreachable'; url: string; reason: string; checked: string };

/** What a finished test can answer. */
export type PaperlessAnswer = Exclude<PaperlessStatus, { kind: 'testing' }>;

/** Props for {@link PaperlessWidget}. */
export interface PaperlessWidgetProps {
  status: PaperlessStatus;
  tokenStored: boolean;
  /** Why Test connection is off, when it is. */
  locked?: string;
  onTest?: () => void;
}

function statusLine(status: PaperlessStatus): {
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

/** Paperless's status line, the stored-token note and Test connection. */
export function PaperlessWidget({ status, tokenStored, locked, onTest }: PaperlessWidgetProps) {
  const line = statusLine(status);
  const Icon = line.icon;
  const testing = status.kind === 'testing';
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
          disabled={testing || locked !== undefined}
          title={locked}
          onClick={onTest}
        >
          {testing ? 'Testing' : 'Test connection'}
        </Button>
      )}
    </div>
  );
}
