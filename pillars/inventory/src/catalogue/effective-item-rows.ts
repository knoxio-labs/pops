import { inArray } from 'drizzle-orm';

import { items } from '../db/schema.js';
import { ItemValueReader } from './item-value-reader.js';
import { readIdBatches } from './read-id-batches.js';

import type { CommandDb } from '../domain/commands/entities.js';
import type { ExpressionSnapshotItem } from './expression-types.js';
import type { ReadItemFieldValue } from './item-value-types.js';
import type { ReferenceWireValue } from './value-types.js';

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

  constructor(
    private readonly db: CommandDb,
    itemIds: readonly string[] = [],
    private readonly valueReader = new ItemValueReader(db, itemIds)
  ) {
    this.preload(itemIds);
  }

  /** Loads each requested item's metadata and canonical rows once for this snapshot. */
  preload(itemIds: readonly string[]): void {
    const missing = [...new Set(itemIds)].filter((itemId) => !this.#items.has(itemId));
    if (missing.length > 0) {
      for (const itemId of missing) this.#items.set(itemId, null);
      const rows = readIdBatches(missing).flatMap((batch) =>
        this.db
          .select({
            id: items.id,
            revision: items.revision,
            typeId: items.typeId,
            deletedAt: items.deletedAt,
          })
          .from(items)
          .where(inArray(items.id, batch))
          .all()
      );
      for (const row of rows) this.#items.set(row.id, this.record(row));
    }
    this.valueReader.preload(itemIds);
  }

  /** Returns a stored reference identity used to preload declared dependency paths. */
  storedReference(itemId: string, fieldId: string): ReferenceWireValue | null {
    return this.valueReader.storedReference(itemId, fieldId);
  }

  private record(row: {
    readonly id: string;
    readonly revision: number;
    readonly typeId: string | null;
    readonly deletedAt: string | null;
  }): SnapshotItemRecord {
    return {
      item: { id: row.id, revision: row.revision, fields: new Map() },
      typeId: row.typeId,
      deleted: row.deletedAt !== null,
    };
  }

  item(itemId: string): SnapshotItemRecord | null {
    this.preload([itemId]);
    return this.#items.get(itemId) ?? null;
  }

  values(itemId: string): readonly ReadItemFieldValue[] {
    const cached = this.#values.get(itemId);
    if (cached !== undefined) return cached;
    const values = this.valueReader.read(itemId);
    this.#values.set(itemId, values);
    return values;
  }
}
