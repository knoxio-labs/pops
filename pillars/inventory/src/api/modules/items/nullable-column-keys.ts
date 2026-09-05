import type { homeInventory } from '../../../db/index.js';

type InventoryInsert = typeof homeInventory.$inferInsert;

/**
 * The keys of `Input` naming a `home_inventory` column that both sides agree
 * carries `V | null` — the input supplies `V | null | undefined`, and the
 * column accepts `V | null`.
 *
 * The create and update builders pass such keys through in a loop that writes
 * `input[key] ?? null` without inspecting the key. That loop only holds while
 * every key in the list satisfies both halves: a `NOT NULL` column (`itemName`)
 * would be cleared, and a column whose type differs from the input's (`inUse`,
 * an `integer` fed by a `boolean`) would be given a value it cannot hold.
 * Constraining the key lists to this set turns either mistake into a compile
 * error at the list, which is where the key is written.
 */
export type NullableColumnKeys<Input, V> = {
  [K in keyof Input & keyof InventoryInsert]-?: [Exclude<Input[K], undefined>] extends [V | null]
    ? [V | null] extends [InventoryInsert[K]]
      ? K
      : never
    : never;
}[keyof Input & keyof InventoryInsert];
