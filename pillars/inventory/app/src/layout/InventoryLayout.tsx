import { useMemo, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';

import { useInterruption } from '../foundation/interruptions/interruption-store';
import { ReloadRequired, SessionExpired } from '../foundation/interruptions/interruptions';
import { ShortcutProvider } from '../foundation/shortcuts/shortcut-provider';
import { ShortcutSheet } from '../foundation/shortcuts/shortcut-sheet';
import { globalShortcutHandlers } from './global-shortcuts';

import type { ReactElement } from 'react';

/** Hosts inventory-wide shortcuts and the shared keyboard-shortcut sheet. */
export function InventoryLayout(): ReactElement {
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const interruption = useInterruption();
  const handlers = useMemo(
    () => globalShortcutHandlers({ navigate, openShortcutSheet: () => setSheetOpen(true) }),
    [navigate]
  );

  return (
    <ShortcutProvider globalHandlers={handlers}>
      <Outlet />
      {interruption === 'reload-required' && (
        <div className="pointer-events-none fixed right-4 bottom-4 z-40 [&>*]:pointer-events-auto">
          <ReloadRequired onReload={() => window.location.reload()} />
        </div>
      )}
      {interruption === 'session-expired' && (
        <SessionExpired onSignIn={() => window.location.reload()} />
      )}
      <ShortcutSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </ShortcutProvider>
  );
}
