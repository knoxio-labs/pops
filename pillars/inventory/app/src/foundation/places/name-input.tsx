import { CircleAlert } from 'lucide-react';
import { useState } from 'react';

import { Input, cn } from '@pops/ui';

import type { ReactElement } from 'react';

/** Props for the inline place name editor. */
export interface NameInputProps {
  initial?: string;
  label: string;
  placeholder?: string;
  /** Returns a validation problem, or null when the name was accepted. */
  onCommit: (name: string) => string | null;
  onCancel: () => void;
  /** An initial validation problem to show below the field. */
  problem?: string | null;
  className?: string;
}

/** Saves a place name on Enter, reports validation problems, and cancels on Escape. */
export function NameInput({
  initial = '',
  label,
  placeholder,
  onCommit,
  onCancel,
  problem: seededProblem = null,
  className,
}: NameInputProps): ReactElement {
  const [value, setValue] = useState(initial);
  const [problem, setProblem] = useState(seededProblem);
  return (
    <div className={cn('relative min-w-0 flex-1 py-0.5', className)}>
      <Input
        autoFocus
        aria-label={label}
        aria-invalid={problem !== null || undefined}
        placeholder={placeholder}
        value={value}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          setValue(event.target.value);
          setProblem(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            setProblem(onCommit(value));
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
        className="h-8 px-2 text-base md:text-sm"
      />
      {problem ? (
        <p
          role="alert"
          className="absolute top-full right-0 left-0 z-10 mt-1 flex items-start gap-1.5 rounded-md border border-warning/40 bg-popover px-2 py-1.5 text-xs shadow-md"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
          {problem}
        </p>
      ) : null}
    </div>
  );
}
