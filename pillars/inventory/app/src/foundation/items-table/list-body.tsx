import { cn } from '@pops/ui';

import type { ReactElement, ReactNode } from 'react';

/** The bordered scrolling region shared by inventory list bodies. */
export function ListBody(props: { children: ReactNode; className?: string }): ReactElement {
  return (
    <div
      className={cn(
        'relative min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card',
        props.className
      )}
      data-list-body
    >
      {props.children}
    </div>
  );
}
