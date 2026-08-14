/**
 * Narrow an unknown value to a plain keyed object. Arrays are excluded: every
 * caller here treats "array" and "object" as different shapes.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursively sort object keys so the emitted document is byte-stable and the
 * `generate:openapi && git diff --exit-code` drift check cannot flap on key
 * ordering.
 *
 * Takes and returns `unknown` rather than a generic: the generic form needs an
 * `as unknown as T` on the array branch to convince the compiler, and a cast
 * that broad defeats the point of having a type here at all.
 */
export function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => sortJson(item));
  }
  if (isRecord(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).toSorted()) {
      sorted[key] = sortJson(value[key]);
    }
    return sorted;
  }
  return value;
}
