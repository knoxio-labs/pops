import type { ReactNode } from 'react';

export interface EmptyPanelProps {
  title: string;
  hint: string;
  /** A way out of the emptiness, where the screen has one to offer. */
  action?: ReactNode;
}

/**
 * The dashed panel every purchases screen uses to say a list is empty.
 *
 * Shared rather than composed from `EmptyState` in `@pops/ui`: this is the
 * treatment the shipping pages carry, and the point of these screens is to
 * iterate on that treatment in one place.
 */
export function EmptyPanel({ title, hint, action }: EmptyPanelProps) {
  return (
    <div className="rounded-md border border-dashed p-10 text-center">
      <p className="mb-2 text-base font-medium">{title}</p>
      <p className="text-muted-foreground text-sm">{hint}</p>
      {action !== undefined && <div className="mt-3">{action}</div>}
    </div>
  );
}
