/**
 * The item form's draft and its reducer: name (the only required value),
 * type and its field values, code, quantity, destination, note and computed
 * overrides. Values typed under one type are kept when the type changes, so
 * switching back finds them; only the chosen type's values are saved.
 */
import { EMPTY_DRAFTS } from '../field-editors/field-model';
import { codeEntry, codeReducer } from './code-assist';

import type { FieldDrafts, ReferenceChoice } from '../field-editors/field-model';
import type { Placement } from '../shared/model';
import type { CodeAction, CodeEntry } from './code-assist';

/** Everything typed before the item exists, or before an edit is saved. */
export interface ItemDraft {
  mode: 'create' | 'edit';
  name: string;
  typeId: string | null;
  quantity: string;
  placement: Placement;
  note: string;
  fields: FieldDrafts;
  code: CodeEntry;
  /** Typed values replacing a computed result, by field id. */
  overrides: Readonly<Record<string, string>>;
  /** Save was pressed at least once, so every error shows, not only touched ones. */
  submitted: boolean;
}

/** Things the person does to the draft. */
export type DraftAction =
  | { type: 'name'; value: string }
  | { type: 'type'; typeId: string | null; containment: boolean }
  | { type: 'quantity'; value: string }
  | { type: 'placement'; placement: Placement }
  | { type: 'note'; value: string }
  | { type: 'field-text'; fieldId: string; values: readonly string[] }
  | { type: 'field-refs'; fieldId: string; refs: readonly ReferenceChoice[] }
  | { type: 'override'; fieldId: string; value: string | null }
  | { type: 'code'; action: CodeAction }
  | { type: 'submit' };

/** A blank create draft. With no destination given, a new item starts in hand. */
export function blankDraft(
  placement: Placement = { kind: 'in-hand' },
  typeId: string | null = null
): ItemDraft {
  return {
    mode: 'create',
    name: '',
    typeId,
    quantity: '1',
    placement,
    note: '',
    fields: EMPTY_DRAFTS,
    code: codeEntry(),
    overrides: {},
    submitted: false,
  };
}

function withOverride(
  overrides: Readonly<Record<string, string>>,
  fieldId: string,
  value: string | null
): Readonly<Record<string, string>> {
  const next = { ...overrides };
  if (value === null) delete next[fieldId];
  else next[fieldId] = value;
  return next;
}

/**
 * Choosing a container type pulls quantity to 1, because a container is
 * always exactly one (ADR-002 D3); the view says so rather than refusing.
 */
function withType(draft: ItemDraft, typeId: string | null, containment: boolean): ItemDraft {
  return { ...draft, typeId, quantity: containment ? '1' : draft.quantity };
}

/** The draft reducer. */
export function draftReducer(draft: ItemDraft, action: DraftAction): ItemDraft {
  switch (action.type) {
    case 'name':
      return { ...draft, name: action.value };
    case 'type':
      return withType(draft, action.typeId, action.containment);
    case 'quantity':
      return { ...draft, quantity: action.value };
    case 'placement':
      return { ...draft, placement: action.placement };
    case 'note':
      return { ...draft, note: action.value };
    case 'field-text':
      return {
        ...draft,
        fields: {
          ...draft.fields,
          text: { ...draft.fields.text, [action.fieldId]: action.values },
        },
      };
    case 'field-refs':
      return {
        ...draft,
        fields: { ...draft.fields, refs: { ...draft.fields.refs, [action.fieldId]: action.refs } },
      };
    case 'override':
      return { ...draft, overrides: withOverride(draft.overrides, action.fieldId, action.value) };
    case 'code':
      return { ...draft, code: codeReducer(draft.code, action.action) };
    case 'submit':
      return { ...draft, submitted: true };
  }
}

/**
 * The draft after Save and start another: the same type and destination,
 * everything else cleared, so a run of similar things goes in quickly.
 */
export function draftAfterSaveAndNew(saved: ItemDraft): ItemDraft {
  return blankDraft(saved.placement, saved.typeId);
}
