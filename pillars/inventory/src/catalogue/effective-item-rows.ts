import { eq } from 'drizzle-orm';

import { items } from '../db/schema.js';
import { readItemFieldValues } from './item-values.js';

import type { CommandDb } from '../domain/commands/entities.js';
import type { ExpressionSnapshotItem } from './expression-types.js';
import type { ReadItemFieldValue } from './item-value-types.js';

/** An item row as an effective-value read sees it. */
export interface SnapshotItemRecord {
  readonly item: ExpressionSnapshotItem;
  readonly typeId: string | null;
  readonly deleted: boolean;
}

/** Memoised item rows and persisted values shared by one effective-value read. */
export class EffectiveItemRows {
  readonly #items = new Map<string, SnapshotItemRecord | null>();
  readonly #values = new Map<string, readonly ReadItemFieldValue[]>();

  constructor(private readonly db: CommandDb) {}

  item(itemId: string): SnapshotItemRecord | null {
    if (this.#items.has(itemId)) return this.#items.get(itemId) ?? null;
    const row = this.db
      .select({
        id: items.id,
        revision: items.revision,
        typeId: items.typeId,
        deletedAt: items.deletedAt,
      })
      .from(items)
      .where(eq(items.id, itemId))
      .get();
    const record =
      row === undefined
        ? null
        : {
            item: { id: row.id, revision: row.revision, fields: new Map() },
            typeId: row.typeId,
            deleted: row.deletedAt !== null,
          };
    this.#items.set(itemId, record);
    return record;
  }

  values(itemId: string): readonly ReadItemFieldValue[] {
    const cached = this.#values.get(itemId);
    if (cached !== undefined) return cached;
    const values = readItemFieldValues(this.db, itemId);
    this.#values.set(itemId, values);
    return values;
  }
}
