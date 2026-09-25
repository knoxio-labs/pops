/**
 * The line under a control: a value-rule error (warning tone, never red,
 * because red is kept for irreversible acts) or a quiet hint.
 */
import { TriangleAlert } from 'lucide-react';

import { cn } from '@pops/ui';

import type { ReactNode } from 'react';

/** A problem with what was typed; `id` ties it to the control's `aria-describedby`. */
export function FieldProblem({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-1 flex items-start gap-1.5 text-xs text-foreground">
      <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** A quiet hint under a control. */
export function FieldHint({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p id={id} className={cn('mt-1 text-xs text-muted-foreground', className)}>
      {children}
    </p>
  );
}

/** The ring a control carries while its value breaks a rule. */
export const PROBLEM_RING = 'border-warning ring-1 ring-warning/40';
