/**
 * The TopBar search, open over whatever page it was focused on: the box
 * drawn where the shell draws it, with the dropdown under it. `/` focuses
 * it from anywhere in Inventory; Enter goes to the results page.
 */
import { Search, X } from 'lucide-react';

import { ButtonPrimitive } from '@pops/ui';

import { KeyCombo } from '../foundation';
import { TopbarDropdown } from './topbar-dropdown';

import type { TopbarDropdownProps } from './topbar-dropdown';

/** The focused box and its dropdown, positioned over the frame's TopBar. */
export function TopbarSearch(props: TopbarDropdownProps) {
  const typed = props.query.trim() !== '';
  return (
    <div className="fixed inset-0 z-50">
      <div aria-hidden className="absolute inset-0 top-14 bg-overlay-scrim/15 md:top-16" />
      <div className="absolute top-2.5 left-1/2 w-xl max-w-[calc(100vw-2rem)] -translate-x-1/2 space-y-2 md:top-3.5">
        <div className="mx-auto flex h-9 w-80 items-center gap-2 rounded-lg border border-ring bg-background px-3 text-sm ring-2 ring-ring/30">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span
            className={
              typed ? 'min-w-0 flex-1 truncate' : 'min-w-0 flex-1 truncate text-muted-foreground'
            }
          >
            {typed ? props.query : 'Name, code, note, type or place'}
          </span>
          {typed ? (
            <ButtonPrimitive variant="ghost" size="icon-xs" aria-label="Clear search">
              <X className="size-3.5" aria-hidden />
            </ButtonPrimitive>
          ) : (
            <KeyCombo sequence={['/']} />
          )}
        </div>
        <TopbarDropdown {...props} />
      </div>
    </div>
  );
}
