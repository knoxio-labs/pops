/**
 * The Inventory settings section's state, the way the Settings app keeps
 * it: saved values by key, each field's save, a rejected value held in its
 * field until it passes, and what Paperless last answered. A value that
 * breaks its field's rule is never saved; a test asks the saved address.
 */
import { fieldError } from '@/kit/shell-settings/section-renderer';

import { inventorySettingsSection, INVENTORY_SETTING_KEYS } from './inventory-settings-manifest';

import type { FieldSaveState } from '@/kit/shell-settings/section-renderer';

import type { PaperlessAnswer, PaperlessStatus } from './paperless-widget';

/** The section's state. */
export interface SectionState {
  values: Readonly<Record<string, string>>;
  drafts: Readonly<Record<string, string>>;
  saveStates: Readonly<Record<string, FieldSaveState>>;
  paperless: PaperlessStatus;
}

/** Everything the section can do to its state. */
export type SectionAction =
  | { type: 'change'; key: string; value: string }
  | { type: 'saved'; key: string }
  | { type: 'test-start' }
  | { type: 'test-result'; status: PaperlessAnswer };

const FIELDS = new Map(
  inventorySettingsSection.groups.flatMap((group) =>
    group.fields.map((field) => [field.key, field] as const)
  )
);

function without(record: Readonly<Record<string, string>>, key: string): Record<string, string> {
  return Object.fromEntries(Object.entries(record).filter(([entry]) => entry !== key));
}

/** The section reducer. */
export function sectionReducer(state: SectionState, action: SectionAction): SectionState {
  switch (action.type) {
    case 'change': {
      const field = FIELDS.get(action.key);
      if (field === undefined) return state;
      if (fieldError(field, action.value) !== null) {
        return { ...state, drafts: { ...state.drafts, [action.key]: action.value } };
      }
      return {
        ...state,
        values: { ...state.values, [action.key]: action.value },
        drafts: without(state.drafts, action.key),
        saveStates: { ...state.saveStates, [action.key]: 'saving' },
      };
    }
    case 'saved':
      return state.saveStates[action.key] === 'saving'
        ? { ...state, saveStates: { ...state.saveStates, [action.key]: 'saved' } }
        : state;
    case 'test-start': {
      const url = state.values[INVENTORY_SETTING_KEYS.paperlessUrl] ?? '';
      return url === '' ? state : { ...state, paperless: { kind: 'testing', url } };
    }
    case 'test-result':
      return { ...state, paperless: action.status };
  }
}

/** A section with these saved values and Paperless status, nothing in flight. */
export function initialSection(
  values: Readonly<Record<string, string>>,
  paperless: PaperlessStatus
): SectionState {
  return { values, drafts: {}, saveStates: {}, paperless };
}
