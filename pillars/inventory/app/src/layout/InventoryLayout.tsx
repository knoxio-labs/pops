import { useMemo, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';

import { ShortcutProvider } from '../foundation/shortcuts/shortcut-provider';
import { ShortcutSheet } from '../foundation/shortcuts/shortcut-sheet';
import { globalShortcutHandlers } from './global-shortcuts';
import { InventoryPalette } from './palette/InventoryPalette';

import type { ReactElement } from 'react';

/** Hosts inventory-wide shortcuts and the shared keyboard-shortcut sheet. */
export function InventoryLayout(): ReactElement {
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const handlers = useMemo(
    () =>
      globalShortcutHandlers({
        navigate,
        openPalette: () => setPaletteOpen(true),
        openShortcutSheet: () => setSheetOpen(true),
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
