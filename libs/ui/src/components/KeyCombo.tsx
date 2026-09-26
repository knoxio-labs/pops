import { formatCombo } from '../lib/key-combo';
import { cn } from '../lib/utils';

import type { ReactElement } from 'react';

/** Renders one token-backed keyboard key cap. */
export function Kbd({
  children,
  className,
}: {
  children: string;
  className?: string;
}): ReactElement {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-sans text-2xs font-medium text-muted-foreground',
        className
      )}
    >
      {children}
    </kbd>
  );
}

/** Renders every key cap in a combo or multi-step keyboard sequence. */
export function KeyCombo({
  sequence,
  className,
}: {
  sequence: readonly string[];
  className?: string;
}): ReactElement {
  const formatted = sequence.map((combo) => formatCombo(combo));
  const label = formatted.map((caps) => caps.join(' ')).join(' then ');
  const caps = formatted.flatMap((comboCaps, step) =>
    comboCaps.map((cap, position) => ({
      id: `${step}/${position}/${cap}`,
      cap,
      spaced: step > 0 && position === 0,
    }))
  );

  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={label}>
      {caps.map((entry) => (
        <Kbd key={entry.id} className={entry.spaced ? 'ml-1' : undefined}>
          {entry.cap}
        </Kbd>
      ))}
    </span>
  );
}
