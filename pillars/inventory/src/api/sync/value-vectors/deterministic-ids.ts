/**
 * A source of UUID-shaped ids that is deterministic across regenerations.
 *
 * `crypto.randomUUID()` — what `item.create`'s `entityId`, a mutation's
 * `mutationId`, and an omitted `put_type`/`put_field`/`put_enum_option` `id`
 * would all otherwise fall back to — makes every regeneration byte-different
 * from the last, which is fatal for a committed fixture three copies and an
 * in-suite drift test all have to agree on byte-for-byte. Every id this
 * fixture mints (type, field, enum option, item, location, mutation) comes
 * from one call to {@link createDeterministicIds} per build, so the exact
 * same authoring and item-creation calls, in the exact same order, produce
 * the exact same ids every time.
 */
export function createDeterministicIds(): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
  };
}
