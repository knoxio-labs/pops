import type { ComponentType } from 'react';

import type { BundleEntry } from '../../bundle-entry';

/** A top-bar widget with the pillar that supplied it. */
export interface RankedTopBarWidget {
  readonly pillarId: string;
  readonly bundleSlot: string;
  readonly order: number;
  readonly Component: ComponentType;
}

function compareRanked(a: RankedTopBarWidget, b: RankedTopBarWidget): number {
  if (a.order !== b.order) return a.order - b.order;
  if (a.pillarId !== b.pillarId) return a.pillarId < b.pillarId ? -1 : 1;
  if (a.bundleSlot === b.bundleSlot) return 0;
  return a.bundleSlot < b.bundleSlot ? -1 : 1;
}

/**
 * Every top-bar widget the resolved bundle map carries, in render order:
 * ascending `order`, ties broken alphabetically by pillar id and then slot.
 *
 * Reads the map and nothing else, so a pillar absent from the registry
 * snapshot contributes nothing — no component, and so nothing it would fetch.
 */
export function rankTopBarWidgets(
  bundleMap: Readonly<Record<string, BundleEntry>>
): readonly RankedTopBarWidget[] {
  const ranked: RankedTopBarWidget[] = [];
  for (const [pillarId, entry] of Object.entries(bundleMap)) {
    for (const widget of entry.topBarWidgets ?? []) {
      ranked.push({ pillarId, ...widget });
    }
  }
  return ranked.toSorted(compareRanked);
}
