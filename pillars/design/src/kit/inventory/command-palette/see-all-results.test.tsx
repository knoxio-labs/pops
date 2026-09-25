import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Box, MoveRight } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommandPalettePanel } from './command-palette';
import { SEE_ALL_RESULTS_ID, searchResultsHref, seeAllResultsEntry } from './palette-groups';
import { INITIAL_PALETTE } from './use-palette-state';

import type { PaletteSource, PaletteStep } from './palette-groups';

afterEach(cleanup);

const source: PaletteSource = {
  commands: [
    { id: 'move', label: 'Move', group: 'commands', icon: MoveRight, argument: 'placement' },
  ],
  inventoryRecords: [{ id: 'hdmi', label: 'HDMI cable 2 m', group: 'records', icon: Box }],
  purchaseRecords: [],
  recents: [],
  arguments: {},
};
const step: PaletteStep = { commandId: 'move', label: 'Move', argument: 'placement' };

describe('searchResultsHref', () => {
  it('opens the Search page on the trimmed, encoded query', () => {
    expect(searchResultsHref('  hdmi & usb ', 'inventory')).toBe(
      '/inventory/search?q=hdmi+%26+usb'
    );
  });

  it('carries the Purchases scope, and leaves Inventory as the default', () => {
    expect(searchResultsHref('cable', 'purchases')).toBe(
      '/inventory/search?q=cable&scope=purchases'
    );
    expect(searchResultsHref('cable', 'inventory')).not.toContain('scope=');
  });
});

describe('seeAllResultsEntry', () => {
  it('offers the hand-off only while a query is searching', () => {
    expect(seeAllResultsEntry('', 'inventory', null)).toBeNull();
    expect(seeAllResultsEntry('   ', 'inventory', null)).toBeNull();
    expect(seeAllResultsEntry('hdmi', 'inventory', step)).toBeNull();
    expect(seeAllResultsEntry(' hdmi ', 'purchases', null)).toMatchObject({
      id: SEE_ALL_RESULTS_ID,
      label: 'See all results in Search',
      detail: '“hdmi” in Purchases',
    });
  });
});

describe('palette search hand-off', () => {
  it('lists the entry after the matches and opens Search with the query', () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    render(
      <CommandPalettePanel
        source={source}
        initial={{ ...INITIAL_PALETTE, query: 'hdmi' }}
        onNavigate={onNavigate}
        onClose={onClose}
      />
    );
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options.at(-1)).toContain('See all results in Search');
    fireEvent.click(screen.getByText('See all results in Search'));
    expect(onNavigate).toHaveBeenCalledWith('/inventory/search?q=hdmi');
    expect(onClose).toHaveBeenCalled();
  });

  it('still offers Search when nothing here matches', () => {
    render(<CommandPalettePanel source={source} initial={{ ...INITIAL_PALETTE, query: 'zzz' }} />);
    expect(screen.getByText('Nothing in Inventory matches “zzz”.')).toBeInTheDocument();
    expect(screen.getByText('See all results in Search')).toBeInTheDocument();
  });

  it('is absent before anything is typed', () => {
    render(<CommandPalettePanel source={source} initial={INITIAL_PALETTE} />);
    expect(screen.queryByText('See all results in Search')).toBeNull();
  });
});
