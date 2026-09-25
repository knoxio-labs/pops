/**
 * The scrolling box every list page in the items unit puts its list in.
 */
import { cn } from '@pops/ui';

import type { ReactNode } from 'react';

/** The scrolling box a list body lives in: bordered, carded, the only scroller on the page. */
export function ListBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn('relative min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card', className)}
      data-list-body
    >
      {children}
    </div>
  );
}
