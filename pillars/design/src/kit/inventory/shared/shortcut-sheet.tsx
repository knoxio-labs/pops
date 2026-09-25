/**
 * The `?` sheet: every shortcut, grouped by where it works, read straight
 * from the registry so it cannot drift from what the keys do.
 */
import { Dialog, DialogContent, DialogTitle, cn } from '@pops/ui';

import { KeyCombo } from './kbd';
import { SCOPE_TITLES, SHORTCUTS } from './shortcuts';

import type { ShortcutScope } from './shortcuts';

const COLUMNS: readonly (readonly ShortcutScope[])[] = [
  ['global'],
  ['list', 'form'],
  ['detail', 'palette'],
];

function Group({ scope }: { scope: ShortcutScope }) {
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

/** The sheet body, three columns on a wide screen, also drawn inline by the gallery. */
export function ShortcutSheetBody({ className }: { className?: string }) {
  return (
    <div
      className={cn('grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2 lg:grid-cols-3', className)}
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

/** The `?` dialog. */
export function ShortcutSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-5xl">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <ShortcutSheetBody />
      </DialogContent>
    </Dialog>
  );
}
