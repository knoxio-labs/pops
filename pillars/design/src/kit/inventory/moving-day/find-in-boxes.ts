/**
 * "Which box is the kettle in?" A query against every box's contents and
 * the boxes' own names and codes. Ranking follows universal search: a name
 * that starts with the query beats one that only contains it, and a box
 * whose own name or code matches comes first with all of its contents.
 */

import { deepContents } from '../foundation';

import type { ItemRowModel, PlacementWorld } from '../foundation';
import type { BoxSummary } from './moving-model';

/** One box that answers the query. */
export interface BoxMatch {
  summary: BoxSummary;
  /** The box's own name or code matched. */
  boxMatched: boolean;
  /** Contents that matched, best first. Every content when the box itself matched. */
  items: ItemRowModel[];
  /** 0: prefix, 1: contains. Lower is better. */
  rank: number;
}

function matchRank(query: string, ...fields: (string | null)[]): number | null {
  let best: number | null = null;
  for (const field of fields) {
    if (field === null) continue;
    const value = field.toLowerCase();
    if (value.startsWith(query)) return 0;
    if (value.includes(query)) best = 1;
  }
  return best;
}

function matchOne(world: PlacementWorld, summary: BoxSummary, query: string): BoxMatch | null {
  const inside = deepContents(world, summary.box.id).filter(
    (entry) => entry.lifecycle === 'active'
  );
  const boxRank = matchRank(query, summary.box.name, summary.box.code);
  if (boxRank !== null) return { summary, boxMatched: true, items: inside, rank: -1 };
  const ranked = inside
    .map((entry) => ({ entry, rank: matchRank(query, entry.name, entry.code) }))
    .filter((hit): hit is { entry: ItemRowModel; rank: number } => hit.rank !== null)
    .toSorted((a, b) => a.rank - b.rank || a.entry.name.localeCompare(b.entry.name));
  const first = ranked[0];
  if (first === undefined) return null;
  return { summary, boxMatched: false, items: ranked.map((hit) => hit.entry), rank: first.rank };
}

/** Boxes answering `query`, best first. A blank query answers nothing. */
export function findInBoxes(
  world: PlacementWorld,
  boxes: readonly BoxSummary[],
  query: string
): BoxMatch[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];
  return boxes
    .flatMap((summary) => {
      const match = matchOne(world, summary, needle);
      return match === null ? [] : [match];
    })
    .toSorted(
      (a, b) =>
        a.rank - b.rank ||
        a.summary.box.name.localeCompare(b.summary.box.name, undefined, { numeric: true })
    );
}

/** Things that matched across all boxes. */
export function matchCount(matches: readonly BoxMatch[]): number {
  return matches.reduce((sum, match) => sum + match.items.length, 0);
}
