import { useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';

import { focusGlobalSearch, registerSearchDropdown } from '@pops/navigation';

import { ShortcutProvider } from '../foundation/shortcuts/shortcut-provider';
import { ShortcutSheet } from '../foundation/shortcuts/shortcut-sheet';
import { globalShortcutHandlers } from './global-shortcuts';
import { InventoryPalette } from './palette/InventoryPalette';
import { openPaletteFromTopBar, setPaletteOpener } from './palette/palette-opener';
import { InventoryTopbarDropdown, TOPBAR_PLACEHOLDER } from './topbar/topbar-provider';

import type { ReactElement } from 'react';

/** Hosts inventory-wide shortcuts and the shared keyboard-shortcut sheet. */
export function InventoryLayout(): ReactElement {
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(
    () =>
      registerSearchDropdown('inventory', {
        Dropdown: InventoryTopbarDropdown,
        placeholder: TOPBAR_PLACEHOLDER,
        hotkeyLabel: '/',
        openCompact: openPaletteFromTopBar,
      }),
    []
  );
  useEffect(() => {
    setPaletteOpener(() => setPaletteOpen(true));
    return () => setPaletteOpener(null);
  }, []);
  const handlers = useMemo(
    () =>
      globalShortcutHandlers({
        navigate,
        openPalette: () => setPaletteOpen(true),
        openShortcutSheet: () => setSheetOpen(true),
        focusSearch: () => {
          if (window.matchMedia('(min-width: 1024px)').matches) focusGlobalSearch();
          else openPaletteFromTopBar();
        },
      }),
    [navigate]
  );

  return (
    <ShortcutProvider globalHandlers={handlers}>
      <Outlet />
      <ShortcutSheet open={sheetOpen} onOpenChange={setSheetOpen} />
      {paletteOpen ? <InventoryPalette onOpenChange={setPaletteOpen} /> : null}
    </ShortcutProvider>
  );
}
