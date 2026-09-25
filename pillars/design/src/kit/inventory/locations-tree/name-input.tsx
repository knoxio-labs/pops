/**
 * Naming a place in place: Enter saves, Escape leaves it as it was, and a
 * name that cannot be used says why under the field instead of closing it.
 */
import { CircleAlert } from 'lucide-react';
import { useState } from 'react';

import { Input, cn } from '@pops/ui';

/** Props for {@link NameInput}. */
export interface NameInputProps {
  initial?: string;
  label: string;
  placeholder?: string;
  /** Returns the problem with the name, or null when it was saved. */
  onCommit: (name: string) => string | null;
  onCancel: () => void;
  /** A problem to show on arrival, for review. */
  problem?: string | null;
  className?: string;
}

/** The inline name field. */
export function NameInput({
  initial = '',
  label,
  placeholder,
  onCommit,
  onCancel,
  problem: seededProblem = null,
  className,
}: NameInputProps) {
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
          if (event.key === 'Enter') setProblem(onCommit(value));
          if (event.key === 'Escape') onCancel();
        }}
        className="h-8 px-2 text-sm"
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
