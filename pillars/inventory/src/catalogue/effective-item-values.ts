import { computedValueCacheFor } from './computed-value-runtime-cache.js';
import { evaluateComputedValue } from './computed-values.js';
import { EffectiveItemRows } from './effective-item-rows.js';
import { computedWire, storedWire } from './effective-item-value-wire.js';
import { evaluateExpression } from './expression-evaluator.js';
import { validateCatalogueExpressions } from './expression-validator.js';

import type { CommandDb } from '../domain/commands/entities.js';
import type { PersistedCatalogue, PersistedItemTypeField } from './catalogue-types.js';
import type { SnapshotItemRecord } from './effective-item-rows.js';
import type { ComputedValueCache } from './expression-cache.js';
import type {
  EffectiveComputedValue,
  ExpressionEvaluation,
  ExpressionSnapshot,
  SnapshotFieldValue,
  ValidatedExpression,
} from './expression-types.js';
import type { EffectiveItemFieldValue, ReadItemFieldValue } from './item-value-types.js';

function expressionKey(typeId: string, fieldId: string): string {
  return `${typeId}:${fieldId}`;
}

/**
 * Reads effective values against one catalogue snapshot. Pass a null cache to
 * evaluate an unpublished draft: its revision is reused across edits, so a
 * value cached under it could be stale on the next read.
 */
export class EffectiveValueReader {
  readonly #rows: EffectiveItemRows;
  readonly #evaluating = new Set<string>();
  readonly #expressions: ReadonlyMap<string, ValidatedExpression>;

  constructor(
    db: CommandDb,
    private readonly catalogue: PersistedCatalogue,
    private readonly cache: ComputedValueCache | null = computedValueCacheFor(db)
  ) {
    this.#rows = new EffectiveItemRows(db);
    this.#expressions = new Map(
      validateCatalogueExpressions(catalogue).map((expression) => [
        expressionKey(expression.field.typeId, expression.field.fieldId),
        expression,
      ])
    );
  }

  read(itemId: string): readonly EffectiveItemFieldValue[] {
    const record = this.#rows.item(itemId);
    if (record === null || record.typeId === null) return [];
    const type = this.catalogue.types.find((candidate) => candidate.id === record.typeId);
    if (type === undefined) return [];
    const persisted = this.#rows.values(itemId);
    const effective: EffectiveItemFieldValue[] = persisted
      .filter((entry) => entry.source === 'stored')
      .map(storedWire);
    for (const field of type.effectiveFields) {
      if (field.storage !== 'computed' || field.archivedAt !== null) continue;
      effective.push(computedWire(field.id, this.computed(itemId, record, field, persisted)));
    }
    return effective.toSorted((left, right) => left.fieldId.localeCompare(right.fieldId));
  }

  /** Raw evaluation of one computed field on one item, ignoring any override; null when absent. */
  evaluate(itemId: string, fieldId: string): ExpressionEvaluation | null {
    const typeId = this.#rows.item(itemId)?.typeId ?? null;
    const expression =
      typeId === null ? undefined : this.#expressions.get(expressionKey(typeId, fieldId));
    return expression === undefined ? null : evaluateExpression(expression, this.snapshot(itemId));
  }

  private snapshot(rootItemId: string): ExpressionSnapshot {
    return {
      rootItemId,
      readItem: (itemId) => {
        const record = this.#rows.item(itemId);
        if (record === null) return { state: 'missing' };
        if (record.deleted && itemId !== rootItemId) return { state: 'deleted' };
        return { state: 'resolved', item: record.item };
      },
      readField: (itemId, fieldId) => this.snapshotField(itemId, fieldId),
    };
  }

  private snapshotField(itemId: string, fieldId: string): SnapshotFieldValue | undefined {
    const record = this.#rows.item(itemId);
    if (record === null || record.typeId === null) return undefined;
    const type = this.catalogue.types.find((candidate) => candidate.id === record.typeId);
    const field = type?.effectiveFields.find((candidate) => candidate.id === fieldId);
    if (field === undefined) return undefined;
    if (field.storage === 'stored') {
      const persisted = this.#rows
        .values(itemId)
        .find((entry) => entry.fieldId === fieldId && entry.source === 'stored');
      const value = persisted?.values[0];
      return value === undefined
        ? undefined
        : { state: 'value', value, revision: record.item.revision };
    }
    const effective = this.computed(itemId, record, field, this.#rows.values(itemId));
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
    const cache = this.cache;
    const cached = cache?.get(
      subject,
      (dependencyItemId) => this.#rows.item(dependencyItemId)?.item.revision ?? null
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
      if (value.state === 'value') cache?.set(subject, value);
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
