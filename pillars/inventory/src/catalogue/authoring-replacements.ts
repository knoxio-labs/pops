import { issue } from './authoring-shared.js';
import { fieldById, typeById } from './catalogue-lineage.js';

import type { CatalogueIssue } from './authoring-types.js';
import type { Replaceable } from './catalogue-lineage.js';
import type {
  PersistedCatalogue,
  PersistedItemType,
  PersistedItemTypeField,
} from './catalogue-types.js';

function followsCycle<T extends Replaceable>(
  start: T,
  find: (id: string) => T | undefined
): boolean {
  const seen = new Set<string>();
  let current: T | undefined = start;
  while (current !== undefined && current.replacedBy !== null) {
    if (seen.has(current.id)) return true;
    seen.add(current.id);
    current = find(current.replacedBy);
  }
  return false;
}

function lineageIssue<T extends Replaceable>(
  definition: T,
  label: string,
  find: (id: string) => T | undefined
): CatalogueIssue | null {
  if (definition.replacedBy === null) return null;
  const target = find(definition.replacedBy);
  if (target === undefined) {
    return issue(
      definition.id,
      'replacedBy',
      'replacement_unknown',
      `${label} is not in the draft`
    );
  }
  if (followsCycle(definition, find)) {
    return issue(definition.id, 'replacedBy', 'replacement_cycle', `${label} replaces itself`);
  }
  if (target.archivedAt !== null) {
    return issue(definition.id, 'replacedBy', 'replacement_archived', `${label} is archived`);
  }
  return null;
}

function newLineage<T extends Replaceable>(
  definition: T,
  before: T | undefined,
  issues: CatalogueIssue[]
): boolean {
  if (definition.replacedBy !== null && definition.archivedAt === null) {
    issues.push(
      issue(
        definition.id,
        'archivedAt',
        'replacement_requires_archive',
        'A replaced definition stays archived'
      )
    );
    return false;
  }
  const previous = before?.replacedBy ?? null;
  if (previous !== null && previous !== definition.replacedBy) {
    issues.push(
      issue(
        definition.id,
        'replacedBy',
        'replacement_immutable',
        'A published replacement cannot change'
      )
    );
    return false;
  }
  return definition.replacedBy !== null && previous === null;
}

function fieldTypeIssue(
  field: PersistedItemTypeField,
  replacement: PersistedItemTypeField,
  draft: PersistedCatalogue
): CatalogueIssue | null {
  if (replacement.typeId === field.typeId) return null;
  if (typeById(draft, field.typeId)?.replacedBy === replacement.typeId) return null;
  return issue(
    field.id,
    'replacedBy',
    'replacement_type_mismatch',
    'A replacement field belongs to the same type, or to the type that replaces it'
  );
}

/**
 * Checks the replacement lineage `draft` records against its `base`.
 * Recorded lineage never changes, and a replaced definition stays archived.
 * Lineage new in this draft must name a live definition of the same kind
 * that exists in the draft, without a cycle; a replacement field belongs to
 * the replaced field's type or to the type that replaces that type.
 */
export function validateCatalogueReplacements(
  base: PersistedCatalogue,
  draft: PersistedCatalogue
): CatalogueIssue[] {
  const issues: CatalogueIssue[] = [];
  const findType = (id: string): PersistedItemType | undefined => typeById(draft, id);
  const findField = (id: string): PersistedItemTypeField | undefined => fieldById(draft, id);
  for (const type of draft.types) {
    if (newLineage(type, typeById(base, type.id), issues)) {
      const found = lineageIssue(type, 'Replacement type', findType);
      if (found !== null) issues.push(found);
    }
    for (const field of type.fields) {
      if (!newLineage(field, fieldById(base, field.id), issues)) continue;
      const replacement = field.replacedBy === null ? undefined : findField(field.replacedBy);
      const problem =
        lineageIssue(field, 'Replacement field', findField) ??
        (replacement === undefined ? null : fieldTypeIssue(field, replacement, draft));
      if (problem !== null) issues.push(problem);
    }
  }
  return issues;
}
