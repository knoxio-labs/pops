import { toast } from 'sonner';

import { photoSummary } from '../../foundation/photos/photo-queue';

import type { PhotoUploads } from '../../foundation/photos/use-photo-uploads';
import type { FormTypeDef } from './field-model';
import type { ItemDraft } from './form-draft';
import type { FormSaveActionsOptions } from './form-save-options';
import type { ItemSaveApi } from './save-item';
import type { SaveResult } from './save-types';

function typeFor(options: FormSaveActionsOptions, draft: ItemDraft): FormTypeDef | null {
  if (draft.typeId === null) return null;
  return options.sources.types.find((type) => type.id === draft.typeId) ?? null;
}

/** Inputs for saving the item before settling its queued photos. */
export interface SaveRequestOptions {
  readonly saveApi: ItemSaveApi;
  readonly options: FormSaveActionsOptions;
  readonly submitted: ItemDraft;
  readonly baseRevision: number | null;
  readonly photos: PhotoUploads;
}

/** Saves an item, then waits for its photo queue without undoing the item save. */
export async function saveRequest({
  saveApi,
  options,
  submitted,
  baseRevision,
  photos,
}: SaveRequestOptions): Promise<SaveResult> {
  const type = typeFor(options, submitted);
  const catalogueRevision = options.sources.revision;
  if (catalogueRevision === null) {
    return {
      status: 'refused',
      refusal: {
        kind: 'failed',
        message: 'The published catalogue revision is unavailable. Reload and try again.',
      },
    };
  }
  let result: SaveResult;
  if (options.opening.editing === null) {
    result = await saveApi.create(submitted, type, catalogueRevision);
  } else if (baseRevision === null) {
    result = {
      status: 'refused',
      refusal: {
        kind: 'failed',
        message: 'The item revision is unavailable. Reload and try again.',
      },
    };
  } else {
    result = await saveApi.saveEdits({
      id: options.opening.editing.id,
      draft: submitted,
      initial: options.initial,
      type,
      catalogueRevision,
      baseRevision,
    });
  }
  if (result.status !== 'saved') return result;
  const uploaded = await photos.flush(result.result.itemId);
  const failed = uploaded.queue.some((photo) => photo.status.kind === 'failed');
  if (failed) {
    const summary = photoSummary(uploaded.queue);
    if (summary !== null) toast.error(summary);
  }
  return {
    status: 'saved',
    result: { ...result.result, photos: uploaded.attached },
  };
}
