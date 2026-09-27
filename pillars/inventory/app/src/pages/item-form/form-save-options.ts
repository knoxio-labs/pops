import type { Dispatch } from 'react';

import type { DraftAction, ItemDraft } from './form-draft';
import type { ItemFormOpening } from './form-opening';
import type { FormSources } from './use-form-sources';
import type { PhotoUploads } from './use-photo-uploads';

/** Inputs shared by the item form's save actions and save request. */
export interface FormSaveActionsOptions {
  readonly opening: ItemFormOpening;
  readonly sources: FormSources;
  readonly draft: ItemDraft;
  readonly initial: ItemDraft;
  readonly setInitial: (draft: ItemDraft) => void;
  readonly offline: boolean;
  readonly dispatch: Dispatch<DraftAction>;
  readonly photos: PhotoUploads;
}
