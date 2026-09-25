/**
 * Key caps for visible shortcut hints. A hint is drawn from the registry by
 * id, so the cap on a button and the line in the shortcut sheet are the same
 * data and cannot disagree.
 */
import { cn } from '@pops/ui';

import { formatCombo, shortcut } from './shortcuts';

/** One key cap. */
export function Kbd({ children, className }: { children: string; className?: string }) {
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

/** The caps of a combo or a two-key sequence, e.g. `Mod+k` or `g i`. */
export function KeyCombo({
  sequence,
  className,
}: {
  sequence: readonly string[];
  className?: string;
}) {
  const label = sequence.map((combo) => formatCombo(combo).join(' ')).join(' then ');
  const caps = sequence.flatMap((combo, step) =>
    formatCombo(combo).map((cap, position) => ({
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

/** The hint for a registered shortcut, by id. */
export function ShortcutHint({ id, className }: { id: string; className?: string }) {
  return <KeyCombo sequence={shortcut(id).sequence} className={className} />;
}
