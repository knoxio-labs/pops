/**
 * Deterministic v1 heuristic behind `POST /codes/rank` (POPS-4130). No model
 * call: inventory's `codes/suggest` already computed a safe, free candidate
 * set (`pillars/inventory/src/api/sync/codes.ts`'s `suggestCodes`); this only
 * reorders it, most-likely-first.
 *
 * Every candidate is split into its leading alpha stem and trailing numeric
 * suffix (`ABC123` → `ABC` / `123`); a candidate with no trailing digits gets
 * suffix `0` and keeps its full text as the stem. Two signals score a
 * candidate, each strictly additive so ties fall through to the next one:
 *
 * 1. Stem match against `typeKey`, when given — the type's own key is the
 *    strongest signal of "the pattern this type's codes already follow".
 * 2. Stem match against the MAJORITY stem among `candidates` themselves —
 *    when every candidate already shares one stem (the common case, since
 *    `suggestCodes` always numbers off a single chosen stem), this is a wash
 *    and the ranking falls through to the suffix.
 *
 * Within a score, lower numeric suffix sorts first: `suggestCodes` hands out
 * consecutive numbers immediately above the highest one in use, so the
 * lowest of the batch is the one that continues the existing sequence most
 * directly — the closest thing to "recency" available from candidates alone,
 * with no timestamps in the request to rank by.
 *
 * The sort is stable (`Array.prototype.toSorted` preserves input order among
 * equal comparisons) and `candidates` is never copied by value into a new
 * array of different length, so the result is always exactly a permutation
 * of the input — required by the caller's own re-validation
 * (`pillars/inventory/src/api/ai/client.ts`'s `isPermutation`).
 */

/** What `codes/suggest` is ranking candidates for. */
export interface RankCodesInput {
  readonly name: string;
  readonly typeKey?: string;
  readonly candidates: readonly string[];
}

const TRAILING_NUMBER = /^(.*?)(\d+)$/;

interface Parsed {
  readonly code: string;
  readonly stem: string;
  readonly suffix: number;
  readonly index: number;
}

function parse(code: string, index: number): Parsed {
  const match = TRAILING_NUMBER.exec(code);
  if (match?.[1] !== undefined && match[2] !== undefined) {
    return { code, stem: match[1].toUpperCase(), suffix: Number.parseInt(match[2], 10), index };
  }
  return { code, stem: code.toUpperCase(), suffix: 0, index };
}

/** The stem shared by the most candidates, ties broken by first appearance. */
function majorityStem(parsed: readonly Parsed[]): string | undefined {
  const tally = new Map<string, number>();
  for (const { stem } of parsed) tally.set(stem, (tally.get(stem) ?? 0) + 1);
  let best: string | undefined;
  let bestCount = 0;
  for (const { stem } of parsed) {
    const count = tally.get(stem) ?? 0;
    if (count > bestCount) {
      best = stem;
      bestCount = count;
    }
  }
  return best;
}

function score(
  parsed: Parsed,
  typeKeyStem: string | undefined,
  majority: string | undefined
): number {
  let value = 0;
  if (typeKeyStem !== undefined && parsed.stem === typeKeyStem) value += 2;
  if (majority !== undefined && parsed.stem === majority) value += 1;
  return value;
}

/**
 * Rank `input.candidates` most-likely-first. Always returns a permutation of
 * the input, in constant relation to it — same length, same multiset of
 * strings, only reordered.
 */
export function rankCandidates(input: RankCodesInput): string[] {
  const { candidates, typeKey } = input;
  if (candidates.length <= 1) return [...candidates];

  const parsed = candidates.map((code, index) => parse(code, index));
  const typeKeyStem = typeKey === undefined ? undefined : parse(typeKey, -1).stem;
  const majority = majorityStem(parsed);

  return parsed
    .toSorted((a, b) => {
      const scoreDiff = score(b, typeKeyStem, majority) - score(a, typeKeyStem, majority);
      if (scoreDiff !== 0) return scoreDiff;
      const suffixDiff = a.suffix - b.suffix;
      if (suffixDiff !== 0) return suffixDiff;
      return a.index - b.index;
    })
    .map((entry) => entry.code);
}
