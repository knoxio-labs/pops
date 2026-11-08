import { FileText, Inbox, Lightbulb, Link2, NotebookPen, Ticket } from 'lucide-react';

import { Button } from '@pops/ui';

import { captureKinds } from './model';

import type { CaptureKind } from './model';

/** Icons follow the explicit capture type; unclassified sources remain in the inbox. */
export const captureIcons = {
  idea: Lightbulb,
  note: NotebookPen,
  event: Ticket,
  link: Link2,
  document: FileText,
  unclassified: Inbox,
};

/** Types are explicit choices and never inferred from names, files or pasted prose. */
export function CaptureKinds({
  value,
  onChange,
}: {
  value?: CaptureKind;
  onChange: (kind?: CaptureKind) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Capture type">
      {captureKinds.map((kind) => {
        const Icon = captureIcons[kind.id];
        return (
          <Button
            key={kind.id}
            variant={value === kind.id ? 'secondary' : 'ghost'}
            aria-pressed={value === kind.id}
            className={
              value === kind.id
                ? 'border border-app-accent/50 bg-app-accent/15 text-foreground'
                : undefined
            }
            onClick={() => onChange(value === kind.id ? undefined : kind.id)}
          >
            <Icon className="size-4" aria-hidden />
            {kind.label}
          </Button>
        );
      })}
    </div>
  );
}
