import { Check } from 'lucide-react';

import { cn } from '@pops/ui';

import type { ReactElement } from 'react';

/** The import steps, in order. */
export type ImportStep = 'upload' | 'mapping' | 'preview' | 'import';

const STEPS: readonly { id: ImportStep; label: string }[] = [
  { id: 'upload', label: 'Choose a file' },
  { id: 'mapping', label: 'Match columns' },
  { id: 'preview', label: 'Check rows' },
  { id: 'import', label: 'Import' },
];

/** Renders the numbered import step row and its completion state. */
export function ImportSteps({
  current,
  done = false,
}: {
  current: ImportStep;
  done?: boolean;
}): ReactElement {
  const at = STEPS.findIndex((step) => step.id === current);
  return (
    <ol aria-label="Import steps" className="flex items-center gap-2 text-sm">
      {STEPS.map((step, index) => {
        const complete = index < at || done;
        const active = index === at && !done;
        return (
          <li
            key={step.id}
            aria-current={active ? 'step' : undefined}
            className="flex items-center gap-2"
          >
            {index > 0 ? <span className="h-px w-6 bg-border" aria-hidden /> : null}
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full border text-xs font-semibold tabular-nums',
                complete && 'border-app-accent bg-app-accent text-app-accent-foreground',
                active && 'border-app-accent text-foreground',
                !complete && !active && 'text-muted-foreground'
              )}
            >
              {complete ? <Check className="size-3.5" aria-hidden /> : index + 1}
            </span>
            <span
              className={cn('whitespace-nowrap', active ? 'font-medium' : 'text-muted-foreground')}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
