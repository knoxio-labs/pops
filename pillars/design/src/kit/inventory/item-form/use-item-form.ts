/**
 * The live item form: the draft reducer, the photo queue, the cancel
 * question and the keyboard, over one opening. The suggester and the code
 * check answer after a short delay, as the API would.
 */
import { useReducer, useRef, useState } from 'react';

import { matchesCombo, shortcut } from '../shared/shortcuts';
import { draftReducer } from './form-draft';
import { deriveForm, hasStagedWork } from './form-view';
import { addPhotos, removePhoto, retryPhoto } from './photo-queue';

import type { KeyboardEvent } from 'react';

import type { DraftAction, ItemDraft } from './form-draft';
import type { ItemFormContext, ItemFormOpening } from './form-opening';
import type { FormView } from './form-view';
import type { PhotoFile, PhotoUpload } from './photo-queue';

const ANSWER_DELAY_MS = 450;

function keyOf(id: string): string {
  return shortcut(id).sequence[0] ?? '';
}

/** Everything the form's sections read and call. */
export interface ItemFormApi {
  draft: ItemDraft;
  view: FormView;
  dispatch: (action: DraftAction) => void;
  photos: readonly PhotoUpload[];
  refusedPhotos: readonly string[];
  addFiles: (files: readonly PhotoFile[]) => void;
  removePhoto: (localId: string) => void;
  retryPhoto: (localId: string) => void;
  offline: boolean;
  cancelAsked: boolean;
  setCancelAsked: (open: boolean) => void;
  requestCancel: () => void;
  save: () => void;
  suggestCode: () => void;
  typeCode: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

function useCodeActions(
  typeId: string | null,
  offline: boolean,
  dispatch: (action: DraftAction) => void,
  context: ItemFormContext
): Pick<ItemFormApi, 'suggestCode' | 'typeCode'> {
  const suggestCode = () => {
    if (offline) {
      dispatch({ type: 'code', action: { type: 'suggest-failed', reason: 'offline' } });
      return;
    }
    dispatch({ type: 'code', action: { type: 'suggest' } });
    const suggestion = context.suggest(typeId);
    setTimeout(() => {
      dispatch({ type: 'code', action: { type: 'suggested', suggestion } });
    }, ANSWER_DELAY_MS);
  };
  const typeCode = (value: string) => {
    dispatch({ type: 'code', action: { type: 'typed', value } });
    dispatch({ type: 'code', action: { type: 'check-started' } });
    setTimeout(() => {
      dispatch({ type: 'code', action: { type: 'checked', taken: context.taken } });
    }, ANSWER_DELAY_MS);
  };
  return { suggestCode, typeCode };
}

/** Runs one item form. */
export function useItemForm(opening: ItemFormOpening, context: ItemFormContext): ItemFormApi {
  const [draft, dispatch] = useReducer(draftReducer, opening.draft);
  const initial = useRef(opening.initial ?? opening.draft).current;
  const [photos, setPhotos] = useState<readonly PhotoUpload[]>(opening.photos ?? []);
  const [refusedPhotos, setRefused] = useState<readonly string[]>(opening.refusedPhotos ?? []);
  const [cancelAsked, setCancelAsked] = useState(opening.overlay?.kind === 'cancel');
  const view = deriveForm(draft, context.types);
  const offline = opening.banner === 'offline';
  const staged = photos.filter((photo) => photo.status.kind === 'staged').length;

  const requestCancel = () => {
    if (hasStagedWork(draft, initial, staged)) setCancelAsked(true);
  };
  const save = () => dispatch({ type: 'submit' });
  const { suggestCode, typeCode } = useCodeActions(draft.typeId, offline, dispatch, context);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (matchesCombo(event, keyOf('form-save'))) {
      event.preventDefault();
      save();
    } else if (matchesCombo(event, keyOf('form-cancel'))) {
      requestCancel();
    }
  };

  return {
    draft,
    view,
    dispatch,
    photos,
    refusedPhotos,
    addFiles: (files) => {
      const added = addPhotos(photos, files, draft.mode);
      setPhotos(added.queue);
      setRefused(added.refused);
    },
    removePhoto: (localId) => setPhotos(removePhoto(photos, localId)),
    retryPhoto: (localId) => setPhotos(retryPhoto(photos, localId)),
    offline,
    cancelAsked,
    setCancelAsked,
    requestCancel,
    save,
    suggestCode,
    typeCode,
    onKeyDown,
  };
}
