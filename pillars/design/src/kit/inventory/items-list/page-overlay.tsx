/**
 * Draws an overlay over the whole frame, as the real modal would: a scrim
 * and a slot anchored right (a sheet) or near the top (the palette). Design
 * states use it to show the page and its open overlay in one picture.
 */
import { cn } from '@pops/ui';

import type { ReactNode } from 'react';

/** Props for {@link PageOverlay}. */
export interface PageOverlayProps {
  align: 'right' | 'top';
  children: ReactNode;
  /** A lighter scrim for overlays that are not modal (the search dropdown). */
  quiet?: boolean;
}

/** The overlay. */
export function PageOverlay({ align, children, quiet = false }: PageOverlayProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex',
        align === 'right' ? 'justify-end' : 'items-start justify-center px-4 pt-24'
      )}
    >
      <div
        aria-hidden
        className={cn('absolute inset-0', quiet ? 'bg-overlay-scrim/15' : 'bg-overlay-scrim/40')}
      />
      <div className={cn('relative', align === 'right' ? 'h-full' : 'w-160 max-w-full')}>
        {children}
      </div>
    </div>
  );
}
