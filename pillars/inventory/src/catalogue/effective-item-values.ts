import { eq } from 'drizzle-orm';

import { items } from '../db/schema.js';
import { computedValueCacheFor } from './computed-value-runtime-cache.js';
import { evaluateComputedValue } from './computed-values.js';
import { computedWire, storedWire } from './effective-item-value-wire.js';
import { validateCatalogueExpressions } from './expression-validator.js';
import { readItemFieldValues } from './item-values.js';

import type { CommandDb } from '../domain/commands/entities.js';
import type { PersistedCatalogue, PersistedItemTypeField } from './catalogue-types.js';
import type {
  EffectiveComputedValue,
  ExpressionSnapshot,
  ExpressionSnapshotItem,
  SnapshotFieldValue,
  ValidatedExpression,
} from './expression-types.js';
import type { EffectiveItemFieldValue, ReadItemFieldValue } from './item-value-types.js';

interface SnapshotItemRecord {
  readonly item: ExpressionSnapshotItem;
  readonly typeId: string | null;
  readonly deleted: boolean;
}

function expressionKey(typeId: string, fieldId: string): string {
  return `${typeId}:${fieldId}`;
}

class EffectiveValueReader {
  readonly #items = new Map<string, SnapshotItemRecord | null>();
  readonly #values = new Map<string, readonly ReadItemFieldValue[]>();
  readonly #evaluating = new Set<string>();
  readonly #expressions: ReadonlyMap<string, ValidatedExpression>;

  constructor(
    private readonly db: CommandDb,
    private readonly catalogue: PersistedCatalogue
  ) {
    this.#expressions = new Map(
      validateCatalogueExpressions(catalogue).map((expression) => [
        expressionKey(expression.field.typeId, expression.field.fieldId),
        expression,
      ])
    );
  }

  read(itemId: string): readonly EffectiveItemFieldValue[] {
    const record = this.item(itemId);
    if (record === null || record.typeId === null) return [];
    const type = this.catalogue.types.find((candidate) => candidate.id === record.typeId);
    if (type === undefined) return [];
    const persisted = this.values(itemId);
    const effective: EffectiveItemFieldValue[] = persisted
      .filter((entry) => entry.source === 'stored')
      .map(storedWire);
    for (const field of type.fields) {
      if (field.storage !== 'computed') continue;
      effective.push(computedWire(field.id, this.computed(itemId, record, field, persisted)));
    }
    return effective.toSorted((left, right) => left.fieldId.localeCompare(right.fieldId));
  }

  private item(itemId: string): SnapshotItemRecord | null {
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

  private values(itemId: string): readonly ReadItemFieldValue[] {
    const cached = this.#values.get(itemId);
    if (cached !== undefined) return cached;
    const values = readItemFieldValues(this.db, itemId);
    this.#values.set(itemId, values);
    return values;
  }

  private snapshot(rootItemId: string): ExpressionSnapshot {
    return {
      rootItemId,
      readItem: (itemId) => {
        const record = this.item(itemId);
        if (record === null) return { state: 'missing' };
        if (record.deleted && itemId !== rootItemId) return { state: 'deleted' };
        return { state: 'resolved', item: record.item };
      },
      readField: (itemId, fieldId) => this.snapshotField(itemId, fieldId),
    };
  }

  private snapshotField(itemId: string, fieldId: string): SnapshotFieldValue | undefined {
    const record = this.item(itemId);
    if (record === null || record.typeId === null) return undefined;
    const type = this.catalogue.types.find((candidate) => candidate.id === record.typeId);
    const field = type?.fields.find((candidate) => candidate.id === fieldId);
    if (field === undefined) return undefined;
    if (field.storage === 'stored') {
      const persisted = this.values(itemId).find(
        (entry) => entry.fieldId === fieldId && entry.source === 'stored'
      );
      const value = persisted?.values[0];
      return value === undefined
        ? undefined
        : { state: 'value', value, revision: record.item.revision };
    }
    const effective = this.computed(itemId, record, field, this.values(itemId));
    const revision = record.item.revision;
    if (effective.state === 'unavailable') {
      const { provenance, ...failure } = effective;
      return { ...failure, revision, dependencies: provenance.dependencies };
    }
    const { provenance } = effective;
    const dependencies = provenance.source === 'computed' ? provenance.dependencies : undefined;
    return { state: 'value', value: effective.values[0], revision, dependencies };
  }

  private computed(
    itemId: string,
    record: SnapshotItemRecord,
    field: PersistedItemTypeField,
    persisted: readonly ReadItemFieldValue[]
  ): EffectiveComputedValue {
    if (record.typeId === null) throw new Error(`computed item ${itemId} has no type`);
    const expression = this.#expressions.get(expressionKey(record.typeId, field.id));
    if (expression === undefined) throw new Error(`computed field ${field.id} was not validated`);
    const subject = {
      itemId,
      fieldId: field.id,
      itemRevision: record.item.revision,
      catalogueRevision: this.catalogue.revision.revision,
    };
    const cache = computedValueCacheFor(this.db);
    const cached = cache.get(
      subject,
      (dependencyItemId) => this.item(dependencyItemId)?.item.revision ?? null
    );
    if (cached !== undefined) return cached;
    const evaluationKey = `${itemId}:${field.id}`;
    if (this.#evaluating.has(evaluationKey))
      throw new Error(`runtime expression cycle at ${evaluationKey}`);
    this.#evaluating.add(evaluationKey);
    try {
      const override = persisted.find(
        (entry) => entry.fieldId === field.id && entry.source === 'override'
      )?.values[0];
      const value = evaluateComputedValue({
        allowOverride: field.allowOverride,
        catalogueRevision: this.catalogue.revision.revision,
        expression,
        fieldId: field.id,
        override:
          override === undefined ? { state: 'absent' } : { state: 'value', value: override },
        snapshot: this.snapshot(itemId),
        onEvaluationError: (code) =>
          console.error('[inventory] computed field evaluation failed', {
            itemId,
            fieldId: field.id,
            catalogueRevision: this.catalogue.revision.revision,
            code,
          }),
      });
      if (value.state === 'value') cache.set(subject, value);
      return value;
    } finally {
      this.#evaluating.delete(evaluationKey);
    }
  }
}

/** Reads stored and computed values against one caller-owned SQLite snapshot. */
export function readEffectiveItemFieldValues(
  db: CommandDb,
  catalogue: PersistedCatalogue,
  itemId: string
): readonly EffectiveItemFieldValue[] {
  return new EffectiveValueReader(db, catalogue).read(itemId);
}

/** Reads several items through one immutable dependency snapshot and expression graph. */
export function readEffectiveItemFieldValuesForItems(
  db: CommandDb,
  catalogue: PersistedCatalogue,
  itemIds: readonly string[]
): ReadonlyMap<string, readonly EffectiveItemFieldValue[]> {
  const reader = new EffectiveValueReader(db, catalogue);
  return new Map(itemIds.map((itemId) => [itemId, reader.read(itemId)]));
}
