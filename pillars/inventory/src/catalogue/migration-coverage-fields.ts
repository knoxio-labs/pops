import type { PersistedItemTypeField } from './catalogue-types.js';

interface EffectiveFieldCoverage {
  readonly candidateFieldsById: ReadonlyMap<string, PersistedItemTypeField>;
  readonly fieldTypeIds: ReadonlyMap<string, string>;
  readonly baseEffectiveFieldIds: ReadonlyMap<string, ReadonlySet<string>>;
  readonly candidateEffectiveFieldIds: ReadonlyMap<string, ReadonlySet<string>>;
}

function fieldGainedThroughTree(
  typeId: string,
  fieldId: string,
  coverage: EffectiveFieldCoverage
): boolean {
  const field = coverage.candidateFieldsById.get(fieldId);
  const ownerTypeId = coverage.fieldTypeIds.get(fieldId);
  if (field?.storage !== 'stored' || ownerTypeId === undefined) return false;
  return ownerTypeId !== typeId || field.required;
}

/** Adds field ids whose effective availability changes for selected item types. */
export function addEffectiveFieldCoverage(
  selectedTypeIdList: readonly string[],
  coverage: EffectiveFieldCoverage,
  affectedFieldIds: Set<string>
): void {
  for (const typeId of selectedTypeIdList) {
    const baseFields = coverage.baseEffectiveFieldIds.get(typeId);
    if (baseFields === undefined) continue;
    const candidateFields = coverage.candidateEffectiveFieldIds.get(typeId) ?? new Set<string>();
    for (const fieldId of baseFields) {
      if (!candidateFields.has(fieldId)) affectedFieldIds.add(fieldId);
    }
    for (const fieldId of candidateFields) {
      if (!baseFields.has(fieldId) && fieldGainedThroughTree(typeId, fieldId, coverage)) {
        affectedFieldIds.add(fieldId);
      }
    }
  }
}
