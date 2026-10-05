import { Check, Loader2, X } from 'lucide-react';

import type { ToolActivity } from '../chat-hooks/stream-reducer';

type ToolActivityStatus = ToolActivity['status'];

interface ToolActivityIndicatorProps {
  tools: ToolActivity[];
}

/** Replace common tool-name separators with spaces for display. */
export function toolLabel(name: string): string {
  return name.replace(/[._-]/g, ' ');
}

function toolStatusLabel(status: ToolActivityStatus): string {
  switch (status) {
    case 'started':
      return 'running';
    case 'finished':
      return 'done';
    case 'failed':
      return 'failed';
  }
}

function ToolStatusIcon({ status }: { status: ToolActivityStatus }) {
  switch (status) {
    case 'started':
      return <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />;
    case 'finished':
      return <Check aria-hidden="true" className="h-4 w-4 shrink-0" />;
    case 'failed':
      return <X aria-hidden="true" className="h-4 w-4 shrink-0" />;
  }
}

/** Announces streamed tool activity with an icon and accessible status label. */
export function ToolActivityIndicator({ tools }: ToolActivityIndicatorProps) {
  if (tools.length === 0) return null;

  const nameOccurrences = new Map<string, number>();

  return (
    <div aria-live="polite">
      <ol className="list-none space-y-1">
        {tools.map(({ name, status }) => {
          const occurrence = nameOccurrences.get(name) ?? 0;
          nameOccurrences.set(name, occurrence + 1);
          const rowClassName = status === 'failed' ? 'text-destructive' : 'text-muted-foreground';

          return (
            <li
              key={`${name}-${occurrence}`}
              className={`flex items-center gap-2 text-sm ${rowClassName}`}
            >
              <ToolStatusIcon status={status} />
              <span className="sr-only">{toolStatusLabel(status)}</span>
              <span>{toolLabel(name)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
