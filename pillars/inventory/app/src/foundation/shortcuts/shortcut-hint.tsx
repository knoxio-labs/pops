/** A visible key hint sourced from the inventory shortcut registry. */
import { KeyCombo, cn } from '@pops/ui';

import { shortcut } from './shortcuts';

import type { ReactElement } from 'react';

const ON_PRIMARY =
  '[&_kbd]:border-primary-foreground/30 [&_kbd]:bg-primary-foreground/15 [&_kbd]:text-primary-foreground';

/** Props for {@link ShortcutHint}. */
export interface ShortcutHintProps {
  id: string;
  className?: string;
  onPrimary?: boolean;
}

/** Renders the registered sequence for a shortcut id. */
export function ShortcutHint({
  id,
  className,
  onPrimary = false,
}: ShortcutHintProps): ReactElement {
  return (
    <KeyCombo sequence={shortcut(id).sequence} className={cn(onPrimary && ON_PRIMARY, className)} />
  );
}
