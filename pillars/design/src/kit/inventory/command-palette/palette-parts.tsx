/**
 * The palette's fixed parts: the scope chips, the empty result and the key
 * hints along the bottom.
 */
import { cn } from '@pops/ui';

import { KeyCombo } from '../shared/kbd';

import type { PaletteScope } from './palette-groups';

/** Inventory and Purchases, with the key that switches them; dimmed while a step locks the scope. */
export function ScopeChips({ scope, locked }: { scope: PaletteScope; locked: boolean }) {
  const chip = (id: PaletteScope, label: string) => (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-md px-2 text-xs font-medium',
        scope === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
      )}
    >
      {label}
    </span>
  );
  return (
    <span
      className={cn('flex shrink-0 items-center gap-1', locked && 'opacity-50')}
      aria-label={`Searching ${scope}`}
    >
      {chip('inventory', 'Inventory')}
      {chip('purchases', 'Purchases')}
      <KeyCombo sequence={['Tab']} className="ml-1" />
    </span>
  );
}

/** Nothing matched: where the palette looked, and the one key that helps. */
export function Empty({
  query,
  scope,
  step,
}: {
  query: string;
  scope: PaletteScope;
  step: string | null;
}) {
  const here = scope === 'inventory' ? 'Inventory' : 'Purchases';
  const other = scope === 'inventory' ? 'Purchases' : 'Inventory';
  return (
    <div className="px-4 py-8 text-center text-sm">
      <p className="font-medium">
        {step === null
          ? `Nothing in ${here} matches “${query.trim()}”.`
          : `No choice for ${step} matches “${query.trim()}”.`}
      </p>
      <p className="mt-1 text-muted-foreground">
        {step === null ? (
          <>
            Press <KeyCombo sequence={['Tab']} /> to search {other}.
          </>
        ) : (
          <>
            Press <KeyCombo sequence={['Backspace']} /> on an empty query to go back.
          </>
        )}
      </p>
    </div>
  );
}

/** The palette's key hints. */
export function Footer() {
  const hint = (sequence: string[], text: string) => (
    <span className="inline-flex items-center gap-1">
      <KeyCombo sequence={sequence} /> {text}
    </span>
  );
  return (
    <footer className="flex items-center gap-4 border-t px-3 py-2 text-2xs text-muted-foreground">
      {hint(['Enter'], 'to open or run')}
      {hint(['Mod+Enter'], 'to open beside')}
      {hint(['Backspace'], 'to step back')}
      <span className="ml-auto">{hint(['Escape'], 'to close')}</span>
    </footer>
  );
}
