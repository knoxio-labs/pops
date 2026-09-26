import { issue } from './authoring-shared.js';
import { MAX_TYPE_TREE_DEPTH, typeChain } from './catalogue-tree.js';

import type { CatalogueIssue } from './authoring-types.js';
import type { PersistedCatalogue, PersistedItemType } from './catalogue-types.js';

function parentChainIssues(
  catalogue: PersistedCatalogue,
  type: PersistedItemType
): CatalogueIssue[] {
  const chain = typeChain(catalogue.types, type.id);
  const issues: CatalogueIssue[] = [];
  if (chain.stop === 'missing_parent') {
    issues.push(
      issue(
        type.id,
        'parentTypeId',
        'type_parent_unknown',
        `Parent type ${type.parentTypeId} does not exist`
      )
    );
  }
  if (chain.stop === 'cycle') {
    issues.push(
      issue(type.id, 'parentTypeId', 'type_parent_cycle', 'Type parent chain contains a cycle')
    );
  }
  if (chain.ancestorIds.length + 1 > MAX_TYPE_TREE_DEPTH) {
    issues.push(
      issue(
        type.id,
        'parentTypeId',
        'type_depth_exceeded',
        `Type parent chain exceeds depth ${MAX_TYPE_TREE_DEPTH}`
      )
    );
  }
  return issues;
}

function parentArchiveIssue(
  typesById: ReadonlyMap<string, PersistedItemType>,
  type: PersistedItemType
): CatalogueIssue[] {
  if (type.archivedAt !== null || type.parentTypeId === null) return [];
  const parent = typesById.get(type.parentTypeId);
  if (parent === undefined || parent.archivedAt === null) return [];
  return [
    issue(
      type.id,
      'parentTypeId',
      'type_parent_archived',
      'A live type cannot inherit from an archived parent'
    ),
  ];
}

function inheritedFieldIssues(type: PersistedItemType): CatalogueIssue[] {
  const fieldKeys = new Map<string, string>();
  const issues: CatalogueIssue[] = [];
  for (const field of type.effectiveFields) {
    if (field.archivedAt !== null) continue;
    const normalized = field.key.toLocaleLowerCase();
    const previous = fieldKeys.get(normalized);
    if (previous !== undefined) {
      issues.push(
        issue(field.id, 'key', 'inherited_key_duplicate', `Field key duplicates ${previous}`)
      );
    }
    fieldKeys.set(normalized, field.id);
  }
  return issues;
}

/** Validates parent chains, archived parents and inherited field key collisions. */
export function validateTypeTree(catalogue: PersistedCatalogue): CatalogueIssue[] {
  const typesById = new Map(catalogue.types.map((type) => [type.id, type]));
  return catalogue.types.flatMap((type) => [
    ...parentChainIssues(catalogue, type),
    ...parentArchiveIssue(typesById, type),
    ...inheritedFieldIssues(type),
  ]);
}
