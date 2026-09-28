import { Antenna, Droplet, EthernetPort, Lightbulb, Plug, ToggleRight } from 'lucide-react';

import { cn } from '@pops/ui';

import { INVENTORY_ICONS } from '../model/icons.js';

import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

/** The six fixture kinds recognised by the inventory web UI. */
export type FixtureKind = 'power' | 'light' | 'switch' | 'network' | 'antenna' | 'water';

/** The display label and icon for each recognised fixture kind. */
export const FIXTURE_KINDS: Readonly<Record<FixtureKind, { label: string; icon: LucideIcon }>> = {
  power: { label: 'Power outlet', icon: Plug },
  light: { label: 'Light fitting', icon: Lightbulb },
  switch: { label: 'Switch', icon: ToggleRight },
  network: { label: 'Network port', icon: EthernetPort },
  antenna: { label: 'Antenna point', icon: Antenna },
  water: { label: 'Water point', icon: Droplet },
};

/** Fixture kinds in the order used by filters and forms. */
export const FIXTURE_KIND_ORDER: readonly FixtureKind[] = [
  'power',
  'light',
  'switch',
  'network',
  'antenna',
  'water',
];

/** Returns the known kind named exactly by stored fixture type text. */
export function fixtureKindOf(type: string): FixtureKind | null {
  return FIXTURE_KIND_ORDER.find((kind) => kind === type) ?? null;
}

/** Returns a known kind's label, or preserves an unknown stored type verbatim. */
export function fixtureKindLabel(type: string): string {
  const kind = fixtureKindOf(type);
  return kind === null ? type : FIXTURE_KINDS[kind].label;
}

/** Renders the dashed square mark for a known or unknown fixture kind. */
export function FixtureMark({
  kind,
  size = 'sm',
}: {
  kind: FixtureKind | null;
  size?: 'sm' | 'md';
}): ReactElement {
  const Icon = kind === null ? INVENTORY_ICONS.fixture : FIXTURE_KINDS[kind].icon;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-background text-muted-foreground',
        size === 'md' ? 'size-10' : 'size-7'
      )}
    >
      <Icon className={size === 'md' ? 'size-5' : 'size-4'} aria-hidden />
    </span>
  );
}
