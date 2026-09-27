import type { MovingBox, MovingThing } from './moving-day-model.js';

/** One box that answers a moving-day search. */
export interface MovingBoxMatch {
  readonly box: MovingBox;
  /** Whether the box's own name or code matched. */
  readonly boxMatched: boolean;
  /** Matching contents, or every content when the box itself matched. */
  readonly items: readonly MovingThing[];
  /** Prefix matches sort before substring matches. */
  readonly rank: number;
}

function matchRank(query: string, ...fields: readonly (string | null)[]): number | null {
  let best: number | null = null;
  for (const field of fields) {
    if (field === null) continue;
    const value = field.toLowerCase();
    if (value.startsWith(query)) return 0;
    if (value.includes(query)) best = 1;
  }
  return best;
}

function contentMatches(box: MovingBox, query: string): MovingBoxMatch | null {
  const boxRank = matchRank(query, box.name, box.code);
  if (boxRank !== null) {
    return { box, boxMatched: true, items: box.contents, rank: -1 };
  }
  const matches = box.contents
    .map((item) => ({ item, rank: matchRank(query, item.name, item.code) }))
    .filter(
      (match): match is { readonly item: MovingThing; readonly rank: number } => match.rank !== null
    )
    .toSorted(
      (left, right) => left.rank - right.rank || left.item.name.localeCompare(right.item.name)
    );
  const first = matches[0];
  if (first === undefined) return null;
  return {
    box,
    boxMatched: false,
    items: matches.map((match) => match.item),
    rank: first.rank,
  };
}

/** Finds boxes by name, code, or contents, with prefix matches first. */
export function findInBoxes(boxes: readonly MovingBox[], query: string): readonly MovingBoxMatch[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];
  return boxes
    .flatMap((box) => {
      const match = contentMatches(box, needle);
      return match === null ? [] : [match];
    })
    .toSorted(
      (left, right) =>
        left.rank - right.rank ||
        left.box.name.localeCompare(right.box.name, undefined, { numeric: true })
    );
}

/** Counts matched contents across all result boxes. */
export function matchCount(matches: readonly MovingBoxMatch[]): number {
  return matches.reduce((total, match) => total + match.items.length, 0);
}
