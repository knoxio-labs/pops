/**
 * The settings page's state: what is saved, what is being edited, and what
 * Paperless last said. Saving is refused while the pattern is invalid, and a
 * connection test reports on the URL being edited, not the saved one.
 */
import { previewCodes } from './code-pattern';

/** Every inventory setting the page edits. */
export interface InventorySettings {
  paperlessUrl: string;
  /** Whether a token is stored. The token itself is never sent back to the page. */
  paperlessTokenSet: boolean;
  suggestCodes: boolean;
  codePattern: string;
  labelSheetId: string;
  labelTemplate: 'auto' | 'container' | 'item';
  density: 'compact' | 'comfortable';
}

/** What Paperless last answered. */
export type PaperlessStatus =
  | { kind: 'not-set-up' }
  | { kind: 'testing'; url: string }
  | { kind: 'connected'; url: string; documents: number; checked: string }
  | { kind: 'unreachable'; url: string; reason: string; checked: string };

/** The page's state. */
export interface SettingsState {
  saved: InventorySettings;
  draft: InventorySettings;
  paperless: PaperlessStatus;
  /** Set for the moment after a save, so the page can confirm it. */
  justSaved: boolean;
}

/** Everything the page can do to its state. */
export type SettingsAction =
  | { type: 'edit'; patch: Partial<InventorySettings> }
  | { type: 'discard' }
  | { type: 'save' }
  | { type: 'test-start' }
  | { type: 'test-result'; status: Exclude<PaperlessStatus, { kind: 'testing' }> };

const SETTING_KEYS: readonly (keyof InventorySettings)[] = [
  'paperlessUrl',
  'paperlessTokenSet',
  'suggestCodes',
  'codePattern',
  'labelSheetId',
  'labelTemplate',
  'density',
];

/** Setting keys whose draft differs from what is saved, in page order. */
export function dirtyKeys(state: SettingsState): (keyof InventorySettings)[] {
  return SETTING_KEYS.filter((key) => state.draft[key] !== state.saved[key]);
}

/** Why Save is unavailable, or null when it is not. */
export function saveBlocker(state: SettingsState): string | null {
  if (dirtyKeys(state).length === 0) return 'Nothing has changed.';
  if (state.draft.suggestCodes) {
    const preview = previewCodes(state.draft.codePattern, [{ typeName: 'Item', next: 999 }]);
    if (!preview.ok) return `Fix the code pattern first. ${preview.error}`;
  }
  if (state.draft.paperlessUrl !== '' && !/^https?:\/\/\S+$/u.test(state.draft.paperlessUrl)) {
    return 'The Paperless address must start with http:// or https://.';
  }
  return null;
}

/** The settings reducer. */
export function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case 'edit':
      return { ...state, draft: { ...state.draft, ...action.patch }, justSaved: false };
    case 'discard':
      return { ...state, draft: state.saved, justSaved: false };
    case 'save':
      return saveBlocker(state) === null
        ? { ...state, saved: state.draft, justSaved: true }
        : state;
    case 'test-start':
      return state.draft.paperlessUrl === ''
        ? state
        : { ...state, paperless: { kind: 'testing', url: state.draft.paperlessUrl } };
    case 'test-result':
      return { ...state, paperless: action.status };
  }
}

/** The starting state for saved settings and a Paperless status. */
export function initialSettings(
  saved: InventorySettings,
  paperless: PaperlessStatus,
  draft: Partial<InventorySettings> = {}
): SettingsState {
  return { saved, draft: { ...saved, ...draft }, paperless, justSaved: false };
}
