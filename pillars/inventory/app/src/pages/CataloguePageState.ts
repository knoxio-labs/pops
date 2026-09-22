import { useMemo, type Dispatch, type SetStateAction } from 'react';

import { findCreated, publishedField, reorderField, resolveTypeId } from './cataloguePageHelpers';

import type { CatalogueField, CatalogueOperation, CatalogueType } from '../catalogue-editor/types';
import type { useCatalogueEditor } from '../catalogue-editor/useCatalogueEditor';
import type { EditorMode } from './useTypeCataloguePage';

/** Resolves the selected type and field against each newly persisted catalogue snapshot. */
export function useCataloguePageData(
  source: readonly CatalogueType[] | undefined,
  published: readonly CatalogueType[] | undefined,
  storedTypeId: string | null,
  selectedFieldId: string | null
) {
  const types = useMemo(
    () => [...(source ?? [])].toSorted((left, right) => left.sortOrder - right.sortOrder),
    [source]
  );
  const selectedTypeId = resolveTypeId(types, storedTypeId);
  const selectedType = types.find((type) => type.id === selectedTypeId) ?? null;
  const fields = useMemo(
    () =>
      [...(selectedType?.fields ?? [])].toSorted((left, right) => left.sortOrder - right.sortOrder),
    [selectedType?.fields]
  );
  const selectedField = fields.find((field) => field.id === selectedFieldId);
  const selectedFieldIsPublished = publishedField(published, selectedTypeId, selectedFieldId);
  return {
    fields,
    selectedField,
    selectedFieldId,
    selectedFieldIsPublished,
    selectedType,
    selectedTypeId,
    types,
  };
}

/** Adapts draft mutations to page-level creation, publication, and abandonment actions. */
export function useCataloguePageActions({
  data,
  mode,
  model,
  selectedTypeId,
  setMode,
  setSelectedFieldId,
  setStoredTypeId,
}: {
  readonly data: ReturnType<typeof useCataloguePageData>;
  readonly mode: EditorMode;
  readonly model: ReturnType<typeof useCatalogueEditor>;
  readonly selectedTypeId: string | null;
  readonly setMode: Dispatch<SetStateAction<EditorMode>>;
  readonly setSelectedFieldId: Dispatch<SetStateAction<string | null>>;
  readonly setStoredTypeId: Dispatch<SetStateAction<string | null>>;
}) {
  async function applyOperation(
    operation: CatalogueOperation
  ): Promise<'type' | 'field' | 'saved' | null> {
    const typeIds = new Set(data.types.map((type) => type.id));
    const fieldIds = new Set(data.fields.map((field) => field.id));
    try {
      const result = await model.patchDraft.mutateAsync([operation]);
      const created = findCreated({
        types: result.draft.types,
        typeIds,
        fieldIds,
        mode,
        selectedTypeId,
      });
      if (created.typeId !== null) setStoredTypeId(created.typeId);
      if (created.fieldId !== null) setSelectedFieldId(created.fieldId);
      if (created.mode !== null) setMode(created.mode);
      return created.kind;
    } catch {
      return null;
    }
  }
  function abandon(onSuccess: () => void): void {
    model.abandonDraft.mutate(undefined, { onSuccess });
  }
  function publish(
    input: { note: string | null; minimumProtocol?: number },
    onSuccess: () => void
  ): void {
    model.publishDraft.mutate(input, { onSuccess });
  }
  return { abandon, applyOperation, publish };
}

/** Owns selection transitions and ordered-field movement for the focused editor. */
export function useCataloguePageNavigation({
  fields,
  onOperation,
  selectedType,
  setMode,
  setSelectedFieldId,
  setStoredTypeId,
}: {
  readonly fields: readonly CatalogueField[];
  readonly onOperation: (operation: CatalogueOperation) => Promise<unknown>;
  readonly selectedType: CatalogueType | null;
  readonly setMode: Dispatch<SetStateAction<EditorMode>>;
  readonly setSelectedFieldId: Dispatch<SetStateAction<string | null>>;
  readonly setStoredTypeId: Dispatch<SetStateAction<string | null>>;
}) {
  function selectType(id: string): void {
    setStoredTypeId(id);
    setSelectedFieldId(null);
    setMode('type');
  }
  function createType(): void {
    setMode('new-type');
    setSelectedFieldId(null);
  }
  function selectField(id: string): void {
    setSelectedFieldId(id);
    setMode('field');
  }
  function createField(): void {
    setSelectedFieldId(null);
    setMode('new-field');
  }
  function continueToFields(): void {
    setSelectedFieldId(fields.find((field) => field.archivedAt === null)?.id ?? null);
    setMode(fields.length === 0 ? 'new-field' : 'field');
  }
  function moveField(fieldId: string, direction: -1 | 1): void {
    if (selectedType !== null)
      void onOperation(reorderField(fields, fieldId, direction, selectedType.id));
  }
  return { continueToFields, createField, createType, moveField, selectField, selectType };
}
