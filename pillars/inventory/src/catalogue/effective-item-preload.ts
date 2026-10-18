import { expressionFieldKey } from './expression-dependencies.js';

import type { PersistedCatalogue } from './catalogue-types.js';
import type { EffectiveItemRows } from './effective-item-rows.js';
import type { ExpressionV1, ValidatedExpression } from './expression-types.js';

interface PendingDependency {
  readonly itemId: string;
  readonly fieldId: string;
  readonly via: readonly string[];
}

function expressionReads(node: ExpressionV1): readonly Extract<ExpressionV1, { op: 'read' }>[] {
  switch (node.op) {
    case 'literal':
      return [];
    case 'read':
      return [node];
    case 'negate':
    case 'not':
      return expressionReads(node.value);
    case 'coalesce':
      return node.values.flatMap(expressionReads);
    case 'if':
      return [node.condition, node.thenBranch, node.elseBranch].flatMap(expressionReads);
    default:
      return [node.left, node.right].flatMap(expressionReads);
  }
}

class DependencyPreloader {
  readonly #reads: ReadonlyMap<string, readonly Extract<ExpressionV1, { op: 'read' }>[]>;
  constructor(
    private readonly rows: EffectiveItemRows,
    private readonly catalogue: PersistedCatalogue,
    expressions: ReadonlyMap<string, ValidatedExpression>
  ) {
    this.#reads = new Map(
      [...expressions].map(([key, expression]) => [key, expressionReads(expression.ast)])
    );
  }

  roots(itemIds: readonly string[]): PendingDependency[] {
    return itemIds.flatMap((itemId) => {
      const typeId = this.rows.item(itemId)?.typeId;
      const type = this.catalogue.types.find((candidate) => candidate.id === typeId);
      return (type?.effectiveFields ?? [])
        .filter((field) => field.storage === 'computed' && field.archivedAt === null)
        .map((field) => ({ itemId, fieldId: field.id, via: [] }));
    });
  }

  follow(entry: PendingDependency): PendingDependency[] {
    const typeId = this.rows.item(entry.itemId)?.typeId;
    if (typeId === undefined || typeId === null) return [];
    const referenceFieldId = entry.via[0];
    if (referenceFieldId !== undefined)
      return this.followReference(entry, typeId, referenceFieldId);
    const reads = this.#reads.get(expressionFieldKey({ typeId, fieldId: entry.fieldId })) ?? [];
    return reads.map((dependency) => ({
      itemId: entry.itemId,
      fieldId: dependency.fieldId,
      via: dependency.path,
    }));
  }

  private followReference(
    entry: PendingDependency,
    typeId: string,
    referenceFieldId: string
  ): PendingDependency[] {
    const type = this.catalogue.types.find((candidate) => candidate.id === typeId);
    const field = type?.effectiveFields.find((candidate) => candidate.id === referenceFieldId);
    if (field?.storage !== 'stored') return [];
    const reference = this.rows.storedReference(entry.itemId, referenceFieldId);
    return reference?.targetKind === 'item'
      ? [{ ...entry, itemId: reference.targetId, via: entry.via.slice(1) }]
      : [];
  }
}

/**
 * Preloads declared computed dependencies breadth-first across all roots.
 * Only stored reference paths are followed here; computed references retain
 * lazy evaluation, including their override and unavailable-value semantics.
 * Raw rows remain unparsed until the owning item's evaluation handles errors.
 */
export function preloadEffectiveDependencies(
  rows: EffectiveItemRows,
  catalogue: PersistedCatalogue,
  expressions: ReadonlyMap<string, ValidatedExpression>,
  itemIds: readonly string[]
): void {
  const preloader = new DependencyPreloader(rows, catalogue, expressions);
  let pending = preloader.roots(itemIds);
  const visited = new Set<string>();
  while (pending.length > 0) {
    rows.preload(pending.map((entry) => entry.itemId));
    const unvisited = pending.filter((entry) => {
      const key = JSON.stringify([entry.itemId, entry.fieldId, entry.via]);
      if (visited.has(key)) return false;
      visited.add(key);
      return true;
    });
    pending = unvisited.flatMap((entry) => preloader.follow(entry));
  }
}
