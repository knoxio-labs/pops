/**
 * Typing a list of column keys that a builder passes straight through to a row
 * payload, so the pass-through loop needs no cast.
 *
 * The shape this exists for: a create/update builder holds a list of key names
 * and writes `input[key] ?? null` for each without inspecting the key. Written
 * naively the list is constrained to `keyof Input & keyof Row`, which says the
 * key exists on both sides and **nothing about the types agreeing** — so the
 * loop cannot type-check, the payload gets laundered through a
 * `Record<string, unknown>`, and the assertion out of that bag then hides
 * every mismatch the constraint let past. A `NOT NULL` column in the list is
 * cleared; a column whose type differs from the input's (an `integer` column
 * fed a `boolean`) is written a value it cannot hold. Both compile clean.
 *
 * {@link NullableColumnKeys} is the constraint that closes it, and the two
 * helpers below are the loops it makes writable. A key that does not belong is
 * then rejected at the list, which is where it is written.
 *
 * Type-level only as far as the row is concerned — nothing here imports
 * drizzle-orm or knows what a column is. A caller supplies its own row type,
 * usually `typeof table.$inferInsert`.
 *
 * First applied to inventory's item builders (POPS-2481/POPS-2496), then to
 * media's movie and TV-show builders (POPS-3029), which carried the identical
 * defect against a different table.
 */

/**
 * The keys of `Input` naming a `Row` column that both sides agree carries
 * `V | null` — the input supplies `V | null | undefined`, and the column
 * accepts `V | null`.
 */
export type NullableColumnKeys<Input, Row, V> = {
  [K in keyof Input & keyof Row]-?: [Exclude<Input[K], undefined>] extends [V | null]
    ? [V | null] extends [Row[K]]
      ? K
      : never
    : never;
}[keyof Input & keyof Row];

/**
 * Write `input[key] ?? null` for every key, so an absent key is stored as
 * `null` rather than left out. Create builders want this: it stops an omitted
 * field silently taking a column default.
 */
export function setNullableKeys<K extends string, V>(
  values: Partial<Record<K, V | null>>,
  input: Readonly<Partial<Record<K, V | null>>>,
  keys: readonly K[]
): void {
  for (const key of keys) {
    values[key] = input[key] ?? null;
  }
}

/**
 * Write only the keys the input actually supplied, and report whether any was.
 * Update builders want this: `undefined` means "leave unchanged", `null` means
 * "clear the field", and the two must not collapse into one.
 */
export function assignNullableKeys<K extends string, V>(
  values: Partial<Record<K, V | null>>,
  input: Readonly<Partial<Record<K, V | null>>>,
  keys: readonly K[]
): boolean {
  let touched = false;
  for (const key of keys) {
    const value = input[key];
    if (value === undefined) continue;
    values[key] = value;
    touched = true;
  }
  return touched;
}
