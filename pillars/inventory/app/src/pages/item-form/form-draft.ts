import { codeEntry, codeReducer } from './code-assist';
import { EMPTY_DRAFTS } from './field-model';

import type { Placement } from '../../foundation/model/model';
import type { CodeAction, CodeEntry } from './code-assist';
import type { FieldDrafts, ReferenceChoice } from './field-model';

/** Everything typed in the item form before the server accepts it. */
export interface ItemDraft {
  readonly mode: 'create' | 'edit';
  readonly name: string;
  readonly typeId: string | null;
  readonly quantity: string;
  readonly placement: Placement;
  readonly note: string;
  readonly fields: FieldDrafts;
  readonly code: CodeEntry;
  readonly overrides: Readonly<Record<string, string>>;
  readonly submitted: boolean;
}

/** Actions that change a draft or submit it. */
export type DraftAction =
  | { readonly type: 'name'; readonly value: string }
  | { readonly type: 'type'; readonly typeId: string | null; readonly containment: boolean }
  | { readonly type: 'quantity'; readonly value: string }
  | { readonly type: 'placement'; readonly placement: Placement }
  | { readonly type: 'note'; readonly value: string }
  | { readonly type: 'field-text'; readonly fieldId: string; readonly values: readonly string[] }
  | {
      readonly type: 'field-refs';
      readonly fieldId: string;
      readonly refs: readonly ReferenceChoice[];
    }
  | { readonly type: 'field-boolean'; readonly fieldId: string; readonly value: boolean }
  | { readonly type: 'override'; readonly fieldId: string; readonly value: string | null }
  | { readonly type: 'code'; readonly action: CodeAction }
  | { readonly type: 'submit' }
  | { readonly type: 'replace'; readonly draft: ItemDraft };

/** Creates a blank create draft, optionally preserving a destination and type. */
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

function updateOverride(
  overrides: Readonly<Record<string, string>>,
  fieldId: string,
  value: string | null
): Readonly<Record<string, string>> {
  const next = { ...overrides };
  if (value === null) delete next[fieldId];
  else next[fieldId] = value;
  return next;
}

/** Applies one form action without mutating the previous draft. */
function reduceValueAction(
  draft: ItemDraft,
  action: Exclude<DraftAction, { type: 'submit' | 'replace' }>
): ItemDraft {
  switch (action.type) {
    case 'name':
      return { ...draft, name: action.value };
    case 'type':
      return {
        ...draft,
        typeId: action.typeId,
        quantity: action.containment ? '1' : draft.quantity,
      };
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
    case 'field-boolean':
      return {
        ...draft,
        fields: {
          ...draft.fields,
          booleans: { ...draft.fields.booleans, [action.fieldId]: action.value },
        },
      };
    case 'override':
      return { ...draft, overrides: updateOverride(draft.overrides, action.fieldId, action.value) };
    case 'code':
      return { ...draft, code: codeReducer(draft.code, action.action) };
    default:
      return draft;
  }
}

/** Applies one form action without mutating the previous draft. */
export function draftReducer(draft: ItemDraft, action: DraftAction): ItemDraft {
  if (action.type === 'submit') return { ...draft, submitted: true };
  if (action.type === 'replace') return action.draft;
  return reduceValueAction(draft, action);
}

/** Creates the next draft used by Save and start another. */
export function draftAfterSaveAndNew(saved: ItemDraft): ItemDraft {
  return blankDraft(saved.placement, saved.typeId);
}

/** Serialises draft values into the existing sync command's fields payload. */
export function draftFields(draft: ItemDraft): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [fieldId, values] of Object.entries(draft.fields.text)) {
    const filtered = values.filter((value) => value.trim() !== '');
    if (filtered.length > 0) fields[fieldId] = filtered.length === 1 ? filtered[0] : filtered;
  }
  for (const [fieldId, choices] of Object.entries(draft.fields.refs)) {
    const ids = choices.map((choice) => choice.id);
    if (ids.length > 0) fields[fieldId] = ids.length === 1 ? ids[0] : ids;
  }
  for (const [fieldId, value] of Object.entries(draft.fields.booleans)) fields[fieldId] = value;
  for (const [fieldId, value] of Object.entries(draft.overrides)) fields[fieldId] = value;
  return fields;
}
