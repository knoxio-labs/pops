/**
 * Fixture kinds: the word and symbol for each, and the mark a fixture shows
 * where an item shows its photo. A fixture's mark is square and outlined so
 * it never reads as an item in a mixed list.
 */
import { Antenna, Droplet, EthernetPort, Lightbulb, Plug, ToggleRight } from 'lucide-react';

import { cn } from '@pops/ui';

import type { LucideIcon } from 'lucide-react';

import type { FixtureKind } from './fixture-model';

/** A kind's label and icon. */
export const FIXTURE_KINDS: Readonly<Record<FixtureKind, { label: string; icon: LucideIcon }>> = {
  power: { label: 'Power outlet', icon: Plug },
  light: { label: 'Light fitting', icon: Lightbulb },
  switch: { label: 'Switch', icon: ToggleRight },
  network: { label: 'Network port', icon: EthernetPort },
  antenna: { label: 'Antenna point', icon: Antenna },
  water: { label: 'Water point', icon: Droplet },
};

/** Kinds in filter order. */
export const FIXTURE_KIND_ORDER: readonly FixtureKind[] = [
  'power',
  'light',
  'switch',
  'network',
  'antenna',
  'water',
];

/** The square a fixture shows in a row. */
export function FixtureMark({ kind, size = 'sm' }: { kind: FixtureKind; size?: 'sm' | 'md' }) {
  const Icon = FIXTURE_KINDS[kind].icon;
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
