/** The `?` sheet, rendered directly from the shortcut registry. */
import { Dialog, DialogContent, DialogTitle, KeyCombo, cn } from '@pops/ui';

import { SCOPE_TITLES, SHORTCUTS } from './shortcuts';

import type { ReactElement } from 'react';

import type { ShortcutScope } from './shortcuts';

const COLUMNS: readonly (readonly ShortcutScope[])[] = [
  ['global'],
  ['list', 'form'],
  ['detail', 'palette'],
];

function Group({ scope }: { scope: ShortcutScope }): ReactElement {
  const bindings = SHORTCUTS.filter((binding) => binding.scope === scope);

  return (
    <section aria-labelledby={`shortcuts-${scope}`}>
      <h3
        id={`shortcuts-${scope}`}
        className="mb-1 text-2xs font-semibold uppercase tracking-label text-muted-foreground"
      >
        {SCOPE_TITLES[scope]}
      </h3>
      <dl className="divide-y divide-border/50">
        {bindings.map((binding) => (
          <div key={binding.id} className="flex min-h-6 items-center justify-between gap-3">
            <dt className="text-xs text-foreground">{binding.label}</dt>
            <dd>
              <KeyCombo sequence={binding.sequence} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Props for {@link ShortcutSheetBody}. */
export interface ShortcutSheetBodyProps {
  className?: string;
}

/** The shortcut sheet body, also suitable for an inline foundation preview. */
export function ShortcutSheetBody({ className }: ShortcutSheetBodyProps): ReactElement {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-x-6 gap-y-4 md:max-lg:grid-cols-2 lg:grid-cols-3',
        className
      )}
    >
      {COLUMNS.map((column) => (
        <div key={column.join('-')} className="space-y-3">
          {column.map((scope) => (
            <Group key={scope} scope={scope} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Props for {@link ShortcutSheet}. */
export interface ShortcutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The modal `?` dialog. */
export function ShortcutSheet({ open, onOpenChange }: ShortcutSheetProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-5xl">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <ShortcutSheetBody />
      </DialogContent>
    </Dialog>
  );
}
