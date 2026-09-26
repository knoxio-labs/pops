import { useCallback, useReducer, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useShortcutScope } from '../../foundation/shortcuts/shortcut-provider';
import { draftReducer } from './form-draft';
import { deriveForm, hasStagedWork } from './form-view';
import { useCodeAssist } from './use-code-assist';
import { useFormSaveActions } from './use-form-save-actions';
import { useOnline } from './use-online';

import type { Dispatch } from 'react';

import type { DraftAction, ItemDraft } from './form-draft';
import type { ItemFormOpening } from './form-opening';
import type { FormView } from './form-view';
import type { SaveRefusal } from './save-item';
import type { FormSources } from './use-form-sources';

/** The successful item identity shown after Save and start another. */
export interface JustCreated {
  readonly name: string;
  readonly place: string;
  readonly itemId: string;
}

/** The live state and actions consumed by item-form page sections. */
export interface ItemFormApi {
  readonly draft: ItemDraft;
  readonly initial: ItemDraft;
  readonly view: FormView;
  readonly dispatch: Dispatch<DraftAction>;
  readonly offline: boolean;
  readonly saving: boolean;
  readonly saveError: Extract<SaveRefusal, { kind: 'message' | 'failed' }> | null;
  readonly justCreated: JustCreated | null;
  readonly cancelAsked: boolean;
  readonly setCancelAsked: (open: boolean) => void;
  readonly requestCancel: () => void;
  readonly discard: () => void;
  readonly save: () => void;
  readonly saveAndNew: () => void;
  readonly suggestCode: () => void;
  readonly typeCode: (value: string) => void;
}

function isModalTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('[role="dialog"], [role="alertdialog"], [role="listbox"]') !== null
  );
}

function useNavigation(
  opening: ItemFormOpening,
  draft: ItemDraft,
  initial: ItemDraft
): {
  cancelAsked: boolean;
  setCancelAsked: (open: boolean) => void;
  requestCancel: () => void;
  discard: () => void;
} {
  const navigate = useNavigate();
  const location = useLocation();
  const [cancelAsked, setCancelAsked] = useState(false);
  const leave = useCallback((): void => {
    if (opening.editing !== null) {
      void navigate(`/inventory/items/${opening.editing.id}`);
    } else if (location.key !== 'default') {
      void navigate(-1);
    } else {
      void navigate('/inventory/items');
    }
  }, [location.key, navigate, opening.editing]);
  const requestCancel = useCallback((): void => {
    if (hasStagedWork(draft, initial)) setCancelAsked(true);
    else leave();
  }, [draft, initial, leave]);
  const discard = useCallback((): void => {
    setCancelAsked(false);
    leave();
  }, [leave]);
  return { cancelAsked, setCancelAsked, requestCancel, discard };
}

function useFormShortcuts(
  save: () => void,
  saveAndNew: () => void,
  requestCancel: () => void
): void {
  useShortcutScope('form', {
    'form-save': (event) => {
      if (isModalTarget(event.target)) return false;
      event.preventDefault();
      save();
      return true;
    },
    'form-save-new': (event) => {
      if (isModalTarget(event.target)) return false;
      event.preventDefault();
      saveAndNew();
      return true;
    },
    'form-cancel': (event) => {
      if (isModalTarget(event.target)) return false;
      event.preventDefault();
      requestCancel();
      return true;
    },
  });
}

/** Runs the new item form against catalogue, placement and mutation sources. */
export function useItemForm(opening: ItemFormOpening, sources: FormSources): ItemFormApi {
  const [draft, dispatch] = useReducer(draftReducer, opening.draft);
  const [initial, setInitial] = useState(opening.initial);
  const offline = !useOnline();
  const typeKey =
    sources.catalogue?.types.find((candidate) => candidate.id === draft.typeId)?.key ?? null;
  const typeLabel = draft.typeId === null ? null : sources.typeLabel(draft.typeId);
  const codeAssist = useCodeAssist({
    entry: draft.code,
    name: draft.name,
    typeKey,
    typeLabel,
    online: !offline,
    editingId: opening.editing?.id ?? null,
    dispatch,
  });
  const view = deriveForm(draft, sources.types);
  const actions = useFormSaveActions({
    opening,
    sources,
    draft,
    initial,
    setInitial,
    offline,
    dispatch,
  });
  const navigation = useNavigation(opening, draft, initial);
  useFormShortcuts(actions.save, actions.saveAndNew, navigation.requestCancel);
  return {
    draft,
    initial,
    view,
    dispatch,
    offline,
    saving: actions.saving,
    saveError: actions.saveError,
    justCreated: actions.justCreated,
    cancelAsked: navigation.cancelAsked,
    setCancelAsked: navigation.setCancelAsked,
    requestCancel: navigation.requestCancel,
    discard: navigation.discard,
    save: actions.save,
    saveAndNew: actions.saveAndNew,
    suggestCode: codeAssist.suggest,
    typeCode: codeAssist.type,
  };
}
