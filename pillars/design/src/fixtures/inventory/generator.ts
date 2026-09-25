/**
 * Thousands of items, generated deterministically so the same seed always
 * produces the same population: a render-smoke assertion or a screenshot
 * never flakes on it. Named fixtures in `core.ts` are hand-curated, one per
 * branch a screen draws; this exists so "a long list" is a real number a
 * reviewer can scroll, filter and select across.
 */
import { coreLocations, coreTypes } from './core';
import { at, box, inBox, item } from './core-factory';

import type { ItemRowModel, Lifecycle, SyncState } from '@/kit/inventory/shared/model';

/** Mulberry32: small, deterministic, no dependency. */
export function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, values: readonly T[]): T {
  const value = values[Math.floor(rng() * values.length)];
  if (value === undefined) throw new Error('pick from an empty list');
  return value;
}

const ADJECTIVES = ['Stainless', 'Oak', 'Cordless', 'Vintage', 'Compact', 'Folding', 'Wireless'];
const NOUNS = ['kettle', 'lamp', 'drill', 'jacket', 'speaker', 'chair', 'blender', 'mirror'];
const PLAIN_TYPES = coreTypes.filter((type) => !type.containment).map((type) => type.id);
const LEAF_LOCATIONS = coreLocations.filter(
  (location) => !coreLocations.some((other) => other.parentId === location.id)
);

function lifecycleFor(roll: number): Lifecycle {
  if (roll > 0.99) return 'destroyed';
  if (roll > 0.98) return 'lost';
  if (roll > 0.965) return 'discarded';
  if (roll > 0.94) return 'retired';
  return 'active';
}

function syncFor(roll: number): SyncState {
  if (roll > 0.985) return 'needs-attention';
  if (roll > 0.965) return 'stale';
  if (roll > 0.945) return 'sending';
  if (roll > 0.925) return 'queued';
  return 'synced';
}

function generatedBoxes(count: number, rng: () => number): ItemRowModel[] {
  return Array.from({ length: count }, (_, index) => {
    const n = String(index + 1).padStart(2, '0');
    return box(
      [`gen-box-${n}`, `Box ${n}`, 'type-box'],
      at(pick(rng, LEAF_LOCATIONS).id),
      rng() > 0.6 ? 'open' : 'closed',
      { code: `B${n}`, full: rng() > 0.8 }
    );
  });
}

function generatedItem(
  index: number,
  rng: () => number,
  boxes: readonly ItemRowModel[]
): ItemRowModel {
  const boxed = rng() > 0.55;
  const placement = boxed ? inBox(pick(rng, boxes).id) : at(pick(rng, LEAF_LOCATIONS).id);
  const typed = rng() > 0.1;
  const daysAgo = Math.floor(rng() * 900);
  return item(
    [
      `gen-${String(index).padStart(5, '0')}`,
      `${pick(rng, ADJECTIVES)} ${pick(rng, NOUNS)}`,
      typed ? pick(rng, PLAIN_TYPES) : null,
    ],
    placement,
    {
      quantity: rng() > 0.85 ? 2 + Math.floor(rng() * 10) : 1,
      code: rng() > 0.75 ? `G${String(1000 + index)}` : null,
      lifecycle: lifecycleFor(rng()),
      sync: syncFor(rng()),
      updatedAt: new Date(Date.UTC(2026, 8, 20) - daysAgo * 86_400_000).toISOString(),
    }
  );
}

/** A deterministic population of `count` items plus the boxes they sit in. */
export function generateInventory(count: number, seed = 20260925): ItemRowModel[] {
  const rng = mulberry32(seed);
  const boxes = generatedBoxes(Math.max(1, Math.ceil(count / 40)), rng);
  const items = Array.from({ length: count }, (_, index) => generatedItem(index, rng, boxes));
  return [...boxes, ...items];
}

/** The big list: large enough that virtualisation and selection-at-scale are load-bearing. */
export const generatedInventory: readonly ItemRowModel[] = generateInventory(2400);
