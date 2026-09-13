/**
 * The item form's whole editable state, standing in for
 * `useItemFormPageModel` and the hooks it composes
 * (`useItemMutations`, `usePhotoUploadState`, `useDocumentUploadState`,
 * `useAssetIdValidation`). The source holds the draft in react-hook-form and
 * reaches the server for the item record, the location tree, asset-id
 * uniqueness, and every upload; here the draft lives in plain `useState` and
 * every server round trip is replaced by an `ItemFormOpening` fixture plus a
 * short simulated delay where the source shows a spinner for one.
 *
 * Each section of state (draft values, location tree, photos, documents,
 * connections) lives in its own hook file, the way the source spreads the
 * same concerns across `useItemFormPageModel`, `usePhotoUpload` and
 * `useDocumentUpload`; this file only composes them.
 */
import { useCallback, useState } from 'react';

import { type ItemFormOpening } from './item-form-opening';
import { SIMULATED_SAVE_MS, delay } from './simulated-delay';
import { useAssetIdValidation } from './use-asset-id-validation';
import { useConnectionsState } from './use-connections-state';
import { useDocumentsState } from './use-documents-state';
import { useDraftValues } from './use-draft-values';
import { useLocationTreeState } from './use-location-tree-state';
import { usePhotosState } from './use-photos-state';

export { type ItemFormOpening } from './item-form-opening';

/**
 * The whole item-form draft: field values, validation, and every section's
 * local state, composed the way `useItemFormPageModel` composes its hooks.
 */
export function useItemFormState(opening: ItemFormOpening) {
  const isEditMode = opening.id !== undefined;
  const draft = useDraftValues(opening);
  const location = useLocationTreeState(opening);
  const photos = usePhotosState(opening, isEditMode);
  const documents = useDocumentsState(opening, isEditMode);
  const connections = useConnectionsState(opening, isEditMode);
  const assetId = useAssetIdValidation({
    id: opening.id,
    typeValue: draft.values.type,
    takenAssetIds: opening.takenAssetIds ?? [],
    setValue: (field, value) => draft.onChange(field, value),
    checkOnMountValue: opening.assetIdCheckOnMount ? draft.values.assetId : undefined,
  });

  const [submitted, setSubmitted] = useState(opening.submitted ?? false);
  const [saving, setSaving] = useState(opening.saving ?? false);
  const [saveError, setSaveError] = useState<string | null>(opening.saveError ?? null);
  const [notesPreview, setNotesPreview] = useState(opening.notesPreview ?? false);

  const errors = submitted
    ? {
        itemName: draft.values.itemName ? undefined : 'Item name is required',
        type: draft.values.type ? undefined : 'Type is required',
      }
    : {};

  const onSubmit = useCallback(() => {
    setSubmitted(true);
    if (!draft.values.itemName || !draft.values.type) return;
    setSaving(true);
    setSaveError(null);
    // The source navigates to the item's detail page on success; the canvas
    // has no such page to land on, so this just clears the in-flight state.
    void delay(SIMULATED_SAVE_MS).then(() => setSaving(false));
  }, [draft.values.itemName, draft.values.type]);

  return {
    isEditMode,
    values: draft.values,
    onChange: draft.onChange,
    isDirty: draft.isDirty,
    errors,
    submitted,
    saving,
    saveError,
    onSubmit,
    onCancel: opening.onCancel ?? (() => {}),
    notesPreview,
    onToggleNotesPreview: () => setNotesPreview((v) => !v),
    ...location,
    ...photos,
    ...documents,
    ...connections,
    ...assetId,
  };
}
