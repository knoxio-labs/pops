/**
 * The palette and the placement picker, each drawn open over a page so the
 * review sees them at their real size and against something.
 */
import { coreWorld } from '@/fixtures/inventory/core';
import { paletteSource } from '@/fixtures/inventory/palette-source';
import { recentPlacements } from '@/fixtures/inventory/recents';

import { CommandPalettePanel } from '../command-palette/command-palette';
import { PlacementPickerPanel } from '../placement-picker/placement-picker';
import { Backdrop, Specimen } from './gallery-frame';

import type { PlacementScenario } from '@/fixtures/inventory/placements';

import type { PaletteState } from '../command-palette/use-palette-state';

const MOVE_STEP: PaletteState = {
  query: 'sh',
  scope: 'inventory',
  steps: [{ commandId: 'this-move', label: 'Move', argument: 'placement' }],
};

/** Palette states worth reviewing here; the full set belongs to the palette screen. */
export type PaletteSpecimen = 'empty-query' | 'results' | 'argument-step' | 'no-results';

const PALETTE_STATES: Readonly<
  Record<PaletteSpecimen, { initial: PaletteState; active?: string; note: string }>
> = {
  'empty-query': {
    initial: { query: '', scope: 'inventory', steps: [] },
    active: 'box-k12',
    note: 'Recent records, this item, commands.',
  },
  results: {
    initial: { query: 'cab', scope: 'inventory', steps: [] },
    active: 'box-cables',
    note: 'Name prefix ranks first; codes and paths match too.',
  },
  'argument-step': {
    initial: MOVE_STEP,
    active: 'to-loc-shelving',
    note: 'Move is waiting for a target. Backspace steps back.',
  },
  'no-results': {
    initial: { query: 'snorkel', scope: 'inventory', steps: [] },
    note: 'Says where it looked and how to look elsewhere.',
  },
};

/** The palette, open, in one of its states. */
export function PaletteGallery({ specimen = 'empty-query' }: { specimen?: PaletteSpecimen }) {
  const { initial, active, note } = PALETTE_STATES[specimen];
  return (
    <Specimen label="Command palette" note={note}>
      <Backdrop className="flex h-128 justify-center pt-8">
        <CommandPalettePanel
          key={specimen}
          source={paletteSource}
          initial={initial}
          initialActiveId={active}
          subject={specimen === 'argument-step' ? 'Kitchen 12' : undefined}
        />
      </Backdrop>
    </Specimen>
  );
}

/** The placement picker, open, for one scenario. */
export function PickerGallery({
  scenario,
  label,
  note,
}: {
  scenario: PlacementScenario;
  label: string;
  note: string;
}) {
  return (
    <Specimen label={label} note={note}>
      <Backdrop className="flex h-128 justify-center pt-6">
        <PlacementPickerPanel
          world={coreWorld}
          subject={scenario.subject}
          recents={recentPlacements}
          onPick={() => undefined}
          onCreatePlace={() => undefined}
          initialQuery={scenario.query}
          initialDrillId={scenario.drillId}
        />
      </Backdrop>
    </Specimen>
  );
}
