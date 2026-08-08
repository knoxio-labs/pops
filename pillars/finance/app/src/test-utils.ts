/**
 * Shared helpers for this pillar's unit suites.
 *
 * Sibling of `test-setup.ts`: imported by tests, never by app code.
 */

/**
 * Read `index` out of `items`, throwing when that slot is empty.
 *
 * Under `noUncheckedIndexedAccess` every indexed read is `T | undefined`, and
 * testing-library's `getAllBy*` / `querySelectorAll` results are no exception.
 * An assertion that indexes one has to either weaken to optional chaining —
 * which reports a value mismatch when the real fault is a missing element — or
 * assert non-null. This throws at the index that was missing instead.
 */
export function elementAt<T>(items: ArrayLike<T>, index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`expected an element at index ${index}, collection has ${items.length}`);
  }
  return item;
}
