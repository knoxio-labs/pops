/**
 * Shared helpers for this pillar's unit suites.
 *
 * Sibling of `test-setup.ts`: imported by tests, never by app code.
 */

/**
 * Indexed access that stays honest under `noUncheckedIndexedAccess`.
 *
 * Testing-library's `getAllBy*` / `querySelectorAll` results index to
 * `T | undefined`, so every `[0]` in a suite either needs a non-null
 * assertion (which hides a genuinely empty match behind a later, confusing
 * failure) or loses the assertion entirely. This throws at the index that
 * was missing instead.
 */
export function elementAt<T>(items: ArrayLike<T>, index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`expected an element at index ${index}, collection has ${items.length}`);
  }
  return item;
}
