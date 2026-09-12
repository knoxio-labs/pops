/**
 * Scoring for the tag-suggestion eval (POPS-3677).
 *
 * Pure: no database, no model. `eval-tag-suggestions.ts` gathers the cases and
 * this decides what they say. Kept apart so the scoring — the part that decides
 * whether a prompt revision is reported as better — is tested against cases
 * built to break it rather than against whatever a live run happens to return.
 *
 * Scored per facet, never per row. A row-level "4 of 5 axes right" rounds away
 * exactly the failure this exists to catch: a confident value on an axis the
 * person left empty. That is a **false positive**, it is reported on its own,
 * and it is the headline, because Tag Review pre-accepts every suggestion — a
 * wrong tag the reviewer misses is committed, where a missing one is merely
 * absent.
 */
import { parseTagFacet } from '../src/db/tag-facets.js';

/** One transaction: what was suggested for it and what it was committed with. */
export interface EvalCase {
  suggested: readonly string[];
  committed: readonly string[];
}

/** How one facet fared across every case. */
export interface FacetScore {
  facet: string;
  /** Both sides carry values on the facet and the value sets are equal. */
  exact: number;
  /** Both sides carry values on the facet and the value sets differ. */
  wrongValue: number;
  /** Suggested a value on an axis the committed row leaves empty. */
  falsePositive: number;
  /** Suggested nothing on an axis the committed row fills. */
  falseNegative: number;
  /** Neither side carries a value on the facet. */
  bothEmpty: number;
  total: number;
}

/** A facet's counts as rates over the cases that could produce each. */
export interface FacetRates {
  facet: string;
  /** exact / cases where the committed row fills the facet. */
  recall: number | null;
  /** exact / cases where a value was suggested. */
  precision: number | null;
  /** falsePositive / cases where the committed row leaves the facet empty. */
  falsePositiveRate: number | null;
}

function valuesOn(tags: readonly string[], facet: string): Set<string> {
  const values = new Set<string>();
  for (const tag of tags) {
    const parsed = parseTagFacet(tag);
    if (parsed.facet === facet) values.add(parsed.value);
  }
  return values;
}

function sameValues(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((value) => b.has(value));
}

/** Score every case on every facet in `facets`; a tag on any other facet is ignored. */
export function scoreTagSuggestions(
  cases: readonly EvalCase[],
  facets: readonly string[]
): FacetScore[] {
  return facets.map((facet) => {
    const score: FacetScore = {
      facet,
      exact: 0,
      wrongValue: 0,
      falsePositive: 0,
      falseNegative: 0,
      bothEmpty: 0,
      total: cases.length,
    };
    for (const { suggested, committed } of cases) {
      const s = valuesOn(suggested, facet);
      const c = valuesOn(committed, facet);
      if (s.size === 0 && c.size === 0) score.bothEmpty++;
      else if (s.size === 0) score.falseNegative++;
      else if (c.size === 0) score.falsePositive++;
      else if (sameValues(s, c)) score.exact++;
      else score.wrongValue++;
    }
    return score;
  });
}

function ratio(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

/** Turn counts into rates, null where the denominator is empty rather than a misleading 0. */
export function facetRates(score: FacetScore): FacetRates {
  return {
    facet: score.facet,
    recall: ratio(score.exact, score.exact + score.wrongValue + score.falseNegative),
    precision: ratio(score.exact, score.exact + score.wrongValue + score.falsePositive),
    falsePositiveRate: ratio(score.falsePositive, score.falsePositive + score.bothEmpty),
  };
}

/** 32-bit FNV-1a — stable across runs and machines, which a split has to be. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Share of transactions, in percent, reserved for evaluation. */
export const HELD_OUT_PERCENT = 20;

/**
 * Whether a transaction belongs to the held-out evaluation set.
 *
 * Deterministic on the id alone, so the same rows are held out on every run
 * and by every consumer: anything that shows the model prior tagging as
 * examples must exclude these rows, or the eval scores the model on answers it
 * was just shown.
 */
export function isHeldOut(transactionId: string): boolean {
  return fnv1a(transactionId) % 100 < HELD_OUT_PERCENT;
}

function formatRate(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

/** Render scores as a fixed-width table, false-positive rate first. */
export function formatScoreTable(scores: readonly FacetScore[]): string {
  const header =
    `${'facet'.padEnd(10)} ${'fp-rate'.padStart(8)} ${'precision'.padStart(9)} ${'recall'.padStart(8)}` +
    `  exact wrong    fp    fn empty`;
  const rows = scores.map((score) => {
    const rates = facetRates(score);
    return (
      `${score.facet.padEnd(10)} ${formatRate(rates.falsePositiveRate).padStart(8)} ` +
      `${formatRate(rates.precision).padStart(9)} ${formatRate(rates.recall).padStart(8)}  ` +
      [score.exact, score.wrongValue, score.falsePositive, score.falseNegative, score.bothEmpty]
        .map((n) => String(n).padStart(5))
        .join(' ')
    );
  });
  return [header, ...rows].join('\n');
}
