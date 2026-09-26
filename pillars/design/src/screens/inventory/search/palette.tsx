import {
  browseInventory,
  browseWorld,
  placeOptions,
  typeOptions,
} from '@/fixtures/inventory/items-browse';
import { paletteSource } from '@/fixtures/inventory/palette-source';
import { purchaseResults } from '@/fixtures/inventory/purchases-results';
import { searchRecentQueries, searchRecentRecords } from '@/fixtures/inventory/search-results';
import { CommandPalettePanel, INITIAL_PALETTE } from '@/kit/inventory/foundation';
import { PageOverlay } from '@/kit/inventory/items-list/page-overlay';
import { OverItems, OverSearch } from '@/kit/inventory/search/backdrops';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { PaletteSource, PaletteState } from '@/kit/inventory/foundation';
import type { ReactNode } from 'react';

export const meta: ScreenMeta = { title: 'Command palette', order: 91, frame: 'web' };

/** On a list page there is no "This item": only a record page supplies one. */
const listSource: PaletteSource = {
  ...paletteSource,
  commands: paletteSource.commands.filter((command) => command.group !== 'this-item'),
};

const itemsPage = {
  items: browseInventory,
  world: browseWorld,
  types: typeOptions,
  places: placeOptions,
};
const searchPage = {
  world: browseWorld,
  purchases: purchaseResults,
  types: typeOptions,
  places: placeOptions,
  recentQueries: searchRecentQueries,
  recentRecords: searchRecentRecords,
};

function Palette({
  source,
  initial,
  activeId,
}: {
  source: PaletteSource;
  initial?: Partial<PaletteState>;
  activeId?: string;
}): ReactNode {
  return (
    <PageOverlay align="top">
      <CommandPalettePanel
        source={source}
        initial={{ ...INITIAL_PALETTE, ...initial }}
        initialActiveId={activeId}
      />
    </PageOverlay>
  );
}

const MOVE_STEP = {
  commandId: 'this-move',
  label: 'Move Kitchen 12',
  argument: 'placement' as const,
};

/**
 * Cmd-K from anywhere in Inventory: jump to a page, open a record, or run a
 * verb. On a record's page the verbs for that record lead ("This item").
 * The TopBar box finds; the palette does.
 */
export const states: ScreenStates = {
  'empty-query': () => (
    <OverItems page={itemsPage} overlay={<Palette source={listSource} activeId="box-k12" />} />
  ),
  results: () => (
    <OverItems
      page={itemsPage}
      overlay={<Palette source={listSource} initial={{ query: 'kit' }} activeId="box-k12" />}
    />
  ),
  'this-item': () => (
    <OverSearch
      page={{ ...searchPage, seed: { query: 'k12' } }}
      overlay={<Palette source={paletteSource} activeId="this-move" />}
    />
  ),
  'command-args': () => (
    <OverSearch
      page={{ ...searchPage, seed: { query: 'k12' } }}
      overlay={
        <Palette
          source={paletteSource}
          initial={{ steps: [MOVE_STEP] }}
          activeId="to-loc-shelving"
        />
      }
    />
  ),
  'scoped-purchases': () => (
    <OverItems
      page={itemsPage}
      overlay={
        <Palette
          source={listSource}
          initial={{ query: 'cable', scope: 'purchases' }}
          activeId="po-1"
        />
      }
    />
  ),
  'no-results': () => (
    <OverItems
      page={itemsPage}
      overlay={<Palette source={listSource} initial={{ query: 'snorkel' }} />}
    />
  ),
  'search-mode': () => (
    <OverSearch
      page={{ ...searchPage, narrow: true }}
      overlay={<Palette source={listSource} initial={{ query: 'hdmi' }} activeId="itm-hdmi" />}
    />
  ),
};

export default function PaletteScreen(): ReactNode {
  return <PaletteScreenDefault />;
}

function PaletteScreenDefault(): ReactNode {
  return (
    <OverItems page={itemsPage} overlay={<Palette source={listSource} activeId="box-k12" />} />
  );
}
