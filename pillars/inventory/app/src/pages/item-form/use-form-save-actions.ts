import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';

import { draftAfterSaveAndNew } from './form-draft';
import { deriveForm, placementTargetName } from './form-view';
import { useItemSave, type ItemSaveApi } from './save-item';

import type { Dispatch } from 'react';

import type { FormTypeDef } from './field-model';
import type { DraftAction, ItemDraft } from './form-draft';
import type { ItemFormOpening } from './form-opening';
import type { JustCreated, SaveRefusal, SaveResult } from './save-types';
import type { FormSources } from './use-form-sources';

/** Inputs for the form's create, edit and save-and-new actions. */
export interface FormSaveActionsOptions {
  readonly opening: ItemFormOpening;
  readonly sources: FormSources;
  readonly draft: ItemDraft;
  readonly initial: ItemDraft;
  readonly setInitial: (draft: ItemDraft) => void;
  readonly offline: boolean;
  readonly dispatch: Dispatch<DraftAction>;
}

/** Save actions and transient save feedback returned by the form action hook. */
export interface FormSaveActions {
  readonly saving: boolean;
  readonly saveError: Extract<SaveRefusal, { kind: 'message' | 'failed' }> | null;
  readonly justCreated: JustCreated | null;
  readonly save: () => void;
  readonly saveAndNew: () => void;
}

function typeFor(sources: FormSources, draft: ItemDraft): FormTypeDef | null {
  if (draft.typeId === null) return null;
  return sources.types.find((type) => type.id === draft.typeId) ?? null;
}

type SetSaveError = (error: Extract<SaveRefusal, { kind: 'message' | 'failed' }> | null) => void;

function submittedDraft(
  options: FormSaveActionsOptions,
  setSaveError: SetSaveError
): ItemDraft | null {
  options.dispatch({ type: 'submit' });
  const submitted = { ...options.draft, submitted: true };
  if (options.offline) {
    setSaveError({
      kind: 'message',
      message: 'No connection. Changes are off until it is back.',
    });
    return null;
  }
  if (deriveForm(submitted, options.sources.types).blockers.length > 0) return null;
  setSaveError(null);
  return submitted;
}

function saveRequest(
  saveApi: ItemSaveApi,
  options: FormSaveActionsOptions,
  submitted: ItemDraft,
  baseRevision: number | null
): Promise<SaveResult> {
  const type = typeFor(options.sources, submitted);
  const typeKey = type?.key ?? null;
  if (options.opening.editing === null) return saveApi.create(submitted, typeKey, type);
  if (baseRevision === null)
    return Promise.resolve({
      status: 'refused',
      refusal: {
        kind: 'failed',
        message: 'The item revision is unavailable. Reload and try again.',
      },
    });
  return saveApi.saveEdits({
    id: options.opening.editing.id,
    draft: submitted,
    initial: options.initial,
    typeKey,
    type,
    baseRevision,
  });
}

function applySaveResult({
  result,
  savedDraft,
  saveAndNew,
  options,
  setSaveError,
  setJustCreated,
  setBaseRevision,
  navigate,
}: {
  readonly result: SaveResult;
  readonly savedDraft: ItemDraft;
  readonly saveAndNew: boolean;
  readonly options: FormSaveActionsOptions;
  readonly setSaveError: SetSaveError;
  readonly setJustCreated: (created: JustCreated | null) => void;
  readonly setBaseRevision: (revision: number | null) => void;
  readonly navigate: ReturnType<typeof useNavigate>;
}): void {
  if (result.status === 'refused') {
    if (result.revision !== undefined) setBaseRevision(result.revision);
    if (result.refusal.kind === 'code-taken') {
      options.dispatch({
        type: 'code',
        action: {
          type: 'checked',
          taken: true,
          freeCode: result.refusal.suggestedCode,
          holder: result.refusal.holder,
        },
      });
    } else {
      setSaveError(result.refusal);
    }
    if (result.initial !== undefined) options.setInitial(result.initial);
    return;
  }
  setSaveError(null);
  if (result.result.revision !== null) setBaseRevision(result.result.revision);
  if (saveAndNew) {
    const next = draftAfterSaveAndNew(savedDraft);
    options.setInitial(next);
    options.dispatch({ type: 'replace', draft: next });
    setBaseRevision(null);
    setJustCreated({
      name: savedDraft.name,
      place: placementTargetName(options.sources.world, savedDraft.placement),
      itemId: result.result.itemId,
    });
    return;
  }
  void navigate(`/inventory/items/${result.result.itemId}`);
}

/** Provides create, edit and save-and-new commands for the item form. */
export function useFormSaveActions(options: FormSaveActionsOptions): FormSaveActions {
  const navigate = useNavigate();
  const saveApi = useItemSave();
  const [saveError, setSaveError] = useState<Extract<
    SaveRefusal,
    { kind: 'message' | 'failed' }
  > | null>(null);
  const [justCreated, setJustCreated] = useState<JustCreated | null>(null);
  const [baseRevision, setBaseRevision] = useState<number | null>(options.opening.revision);
  const runResult = useCallback(
    (result: SaveResult, savedDraft: ItemDraft, saveAndNew: boolean): void => {
      applySaveResult({
        result,
        savedDraft,
        saveAndNew,
        options,
        setSaveError,
        setJustCreated,
        setBaseRevision,
        navigate,
      });
    },
    [navigate, options]
  );
  const submit = useCallback(
    (saveAndNew: boolean): void => {
      if (saveAndNew && options.opening.editing !== null) return;
      setJustCreated(null);
      const submitted = submittedDraft(options, setSaveError);
      if (submitted === null) return;
      void saveRequest(saveApi, options, submitted, baseRevision).then((result) =>
        runResult(result, submitted, saveAndNew)
      );
    },
    [baseRevision, options, runResult, saveApi]
  );
  const save = useCallback((): void => {
    submit(false);
  }, [submit]);
  const saveAndNew = useCallback((): void => {
    submit(true);
  }, [submit]);
  return { saving: saveApi.saving, saveError, justCreated, save, saveAndNew };
}
