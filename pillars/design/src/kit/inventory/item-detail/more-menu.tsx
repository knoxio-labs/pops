/**
 * The item's More menu: record verbs (copy code, link, label, history),
 * shape verbs (split, quantity, full), then lifecycle, with Destroy last and
 * the only red entry. Refused entries stay listed with their reason.
 */
import { MoreHorizontal } from 'lucide-react';

import {
  ButtonPrimitive,
  DropdownMenuContent,
  DropdownMenuItemPrimitive,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from '@pops/ui';

import { ShortcutHint } from '../foundation';

import type { MenuEntry } from './detail-verbs';

/** Props for {@link MoreMenu}. */
export interface MoreMenuProps {
  groups: readonly MenuEntry[][];
  defaultOpen?: boolean;
  onSelect?: (entry: MenuEntry) => void;
}

function Entry({ entry, onSelect }: { entry: MenuEntry; onSelect?: MoreMenuProps['onSelect'] }) {
  const refused = entry.disabledReason !== undefined;
  const Icon = entry.icon;
  return (
    <DropdownMenuItemPrimitive
      disabled={refused}
      onSelect={() => onSelect?.(entry)}
      className={cn(
        'min-h-9 gap-2',
        entry.destructive && 'text-destructive focus:text-destructive'
      )}
    >
      <Icon
        className={cn('size-4', entry.destructive ? 'text-destructive' : 'text-muted-foreground')}
        aria-hidden
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span>{entry.label}</span>
        {refused ? (
          <span className="text-2xs text-muted-foreground">{entry.disabledReason}</span>
        ) : null}
      </span>
      {entry.shortcutId && !refused ? <ShortcutHint id={entry.shortcutId} /> : null}
    </DropdownMenuItemPrimitive>
  );
}

/** The More menu on its icon trigger. */
export function MoreMenu({ groups, defaultOpen = false, onSelect }: MoreMenuProps) {
  return (
    <DropdownMenuRoot defaultOpen={defaultOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <ButtonPrimitive variant="outline" size="icon-sm" aria-label="More actions">
          <MoreHorizontal className="size-4" aria-hidden />
        </ButtonPrimitive>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {groups.map((group, index) => (
          <div key={group[0]?.id ?? index} role="none">
            {index > 0 ? <DropdownMenuSeparator /> : null}
            {group.map((entry) => (
              <Entry key={entry.id} entry={entry} onSelect={onSelect} />
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenuRoot>
  );
}
