import { CloudOff, Settings } from 'lucide-react';

import { cn } from '@pops/ui';

import type { ReactElement } from 'react';

import type { PaperlessState } from './detail-model';

/** Returns the short explanation used to disable Paperless actions. */
export function paperlessReason(state: PaperlessState): string | undefined {
  if (state === 'connected') return undefined;
  return state === 'unreachable'
    ? 'Paperless-ngx is unavailable. Actions are disabled until it is reachable.'
    : 'Paperless-ngx is not connected. Actions are disabled until it is configured.';
}

/** Renders the one-line Paperless outage state without hiding Documents. */
export function PaperlessNotice({
  state,
  className,
}: {
  state: PaperlessState;
  className?: string;
}): ReactElement | null {
  const reason = paperlessReason(state);
  if (reason === undefined) return null;
  const Icon = state === 'unreachable' ? CloudOff : Settings;
  return (
    <p
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground',
        className
      )}
    >
      <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{reason}</span>
    </p>
  );
}
