/**
 * Which transactions are held out for evaluating the categorizer (POPS-3677).
 *
 * Lives in `src` rather than beside the eval script because the pillar itself
 * has to honour the split, not only the script that scores it: anything that
 * shows the model how rows were tagged before (POPS-3673) must leave these rows
 * out, or the eval scores the model on answers it was just shown. The finance
 * `tsconfig` excludes `scripts`, so the split could not stay there and be
 * importable from `src`; the eval script imports it from here instead.
 */
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
