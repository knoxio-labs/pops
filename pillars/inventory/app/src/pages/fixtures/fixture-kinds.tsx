import { Antenna, Droplet, EthernetPort, Lightbulb, Plug, ToggleRight } from 'lucide-react';
import { createElement } from 'react';

import { cn } from '@pops/ui';

import type { LucideIcon } from 'lucide-react';

/** The fixture kinds presented by the inventory UI. */
export type FixtureKind = 'power' | 'light' | 'switch' | 'network' | 'antenna' | 'water';

/** The display label and icon for each supported fixture kind. */
export const FIXTURE_KINDS: Readonly<Record<FixtureKind, { label: string; icon: LucideIcon }>> = {
  power: { label: 'Power outlet', icon: Plug },
  light: { label: 'Light fitting', icon: Lightbulb },
  switch: { label: 'Switch', icon: ToggleRight },
  network: { label: 'Network port', icon: EthernetPort },
  antenna: { label: 'Antenna point', icon: Antenna },
  water: { label: 'Water point', icon: Droplet },
};

/** The stable order used by fixture filters and forms. */
export const FIXTURE_KIND_ORDER: readonly FixtureKind[] = [
  'power',
  'light',
  'switch',
  'network',
  'antenna',
  'water',
];

/** Returns whether a server fixture type is one of the UI's known kinds. */
export function isFixtureKind(value: string): value is FixtureKind {
  return FIXTURE_KIND_ORDER.some((kind) => kind === value);
}

/** Returns the display label for a known kind or preserves an unknown server value. */
export function fixtureKindLabel(value: string): string {
  return isFixtureKind(value) ? FIXTURE_KINDS[value].label : value || 'Other';
}

/** Returns the Lucide icon used for a fixture kind, including unknown server kinds. */
export function fixtureKindIcon(value: string): LucideIcon {
  return isFixtureKind(value) ? FIXTURE_KINDS[value].icon : Plug;
}

/** The square mark used to distinguish a fixture from an inventory item. */
export function FixtureMark({ kind, size = 'sm' }: { kind: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-background text-muted-foreground',
        size === 'md' ? 'size-10' : 'size-7'
      )}
    >
      {createElement(fixtureKindIcon(kind), {
        className: size === 'md' ? 'size-5' : 'size-4',
        'aria-hidden': true,
      })}
    </span>
  );
}
