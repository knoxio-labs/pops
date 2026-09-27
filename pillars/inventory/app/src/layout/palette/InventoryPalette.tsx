import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { CommandPalette, initialPaletteState } from '@pops/ui';

import { ShortcutHint } from '../../foundation/shortcuts/shortcut-hint.js';
import { useItemVerbs } from '../../inventory-web/item-verbs.js';
import { recordOpened, recordQuery } from '../../inventory-web/recents.js';
import { paletteRecordHref, runPaletteAction } from './palette-actions.js';
import { searchResultsHref } from './palette-groups.js';
import { useInventoryPaletteSource } from './palette-source.js';
import { paletteScopeFromUrl } from './palette-url.js';

import type { ReactElement } from 'react';

import type { InventoryPaletteCommand, PaletteScope } from './palette-groups.js';

/** Props for the mounted inventory command palette. */
export interface InventoryPaletteProps {
  onOpenChange: (open: boolean) => void;
}

interface PaletteInput {
  readonly query: string;
  readonly scope: PaletteScope;
}

/** Mounts the inventory palette and wires selected commands to existing app actions. */
export function InventoryPalette({ onOpenChange }: InventoryPaletteProps): ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const verbs = useItemVerbs();
  const initialScope = useMemo(
    () => paletteScopeFromUrl(location.pathname, location.search),
    [location.pathname, location.search]
  );
  const [input, setInput] = useState<PaletteInput>({ query: '', scope: initialScope });
  const palette = useInventoryPaletteSource(input);

  const run = useCallback(
    (command: InventoryPaletteCommand, argument: InventoryPaletteCommand | null): void => {
      runPaletteAction({
        action: command.action,
        argument,
        inputQuery: input.query,
        navigate,
        onClose: () => onOpenChange(false),
        verbs,
        world: palette.world,
      });
    },
    [input.query, navigate, onOpenChange, palette.world, verbs]
  );

  const openBeside = useCallback((entry: InventoryPaletteCommand): void => {
    const href = paletteRecordHref(entry.action);
    if (href === null) return;
    if (entry.action.kind === 'open-item') {
      recordOpened({ kind: 'item', id: entry.action.id });
    } else if (entry.action.kind === 'open-location') {
      recordOpened({ kind: 'location', id: entry.action.id });
    }
    window.open(href, '_blank', 'noopener,noreferrer');
  }, []);

  return (
    <CommandPalette
      open
      onOpenChange={onOpenChange}
      source={palette.source}
      initial={initialPaletteState(initialScope)}
      onRun={run}
      onOpenBeside={openBeside}
      onSeeAll={(query, scope) => {
        recordQuery(query);
        void navigate(searchResultsHref(query, scope === 'purchases' ? 'purchases' : 'inventory'));
        onOpenChange(false);
      }}
      onQueryChange={(query, scope) => {
        setInput({ query, scope: scope === 'purchases' ? 'purchases' : 'inventory' });
      }}
      renderHint={(entry) =>
        entry.shortcutId === undefined ? null : <ShortcutHint id={entry.shortcutId} />
      }
      onClose={() => onOpenChange(false)}
    />
  );
}
