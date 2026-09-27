import { cn } from '@pops/ui';

import { searchResultDomId } from './search-model.js';

import type { MouseEvent, ReactNode } from 'react';

/** Props shared by every result option in the listbox. */
export interface ResultRowFrameProps {
  readonly id: string;
  readonly kind: string;
  readonly active: boolean;
  readonly onActivate: () => void;
  readonly children: ReactNode;
}

/** The accessible option frame used by inventory and purchase result rows. */
export function ResultRowFrame({ id, kind, active, onActivate, children }: ResultRowFrameProps) {
  return (
    <div
      id={searchResultDomId(kind, id)}
      role="option"
      aria-selected={active}
      aria-current={active ? 'true' : undefined}
      tabIndex={-1}
      data-active={active ? 'true' : undefined}
      className={cn(
        'group flex min-h-16 cursor-pointer items-center gap-3 border-b px-3 py-2.5 outline-none',
        active ? 'bg-app-accent/10 ring-1 ring-inset ring-app-accent/40' : 'hover:bg-muted/50'
      )}
      onClick={onActivate}
    >
      {children}
    </div>
  );
}

/** Stops an option click when an embedded action owns the interaction. */
export function stopRowClick(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
}
