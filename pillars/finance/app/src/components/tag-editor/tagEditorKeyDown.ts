import { resolveTypedTag, type TagCreationIntent } from '../../lib/tags';

export interface CoreState {
  tags: string[];
  setTags: React.Dispatch<React.SetStateAction<string[]>>;
  inputValue: string;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export interface KeyDownDeps {
  state: CoreState;
  filtered: string[];
  availableTags: string[];
  creation: TagCreationIntent;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

function completeFirstSuggestion({ filtered, onAddTag }: KeyDownDeps): void {
  const first = filtered[0];
  if (first) onAddTag(first);
}

/**
 * Enter adds what the typed text unambiguously names, and nothing else.
 *
 * Suggestions show the value alone, so typing what is on screen must reuse the
 * faceted tag behind it rather than mint a bare duplicate. A value that names
 * nothing is not minted here either: it needs an axis, and the create row is
 * where that is chosen. Enter used to store the raw string, which is how
 * `Cairns 2026` became a tag no report could group.
 */
function addTypedTag({ state, availableTags, creation, onAddTag }: KeyDownDeps): void {
  const existing = resolveTypedTag(state.inputValue, availableTags);
  if (existing !== undefined) {
    onAddTag(existing);
    return;
  }
  if (creation.kind === 'ready') onAddTag(creation.tag);
}

function removeLastTag({ state, onRemoveTag }: KeyDownDeps): void {
  const last = state.tags.at(-1);
  if (last) onRemoveTag(last);
}

export function makeKeyDownHandler(deps: KeyDownDeps) {
  const { state, filtered, onCancel, onSave } = deps;
  return (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && filtered.length > 0) {
      e.preventDefault();
      completeFirstSuggestion(deps);
      return;
    }
    if (e.key === 'Enter' && !state.inputValue.trim()) {
      e.preventDefault();
      onSave();
      return;
    }
    if ((e.key === 'Enter' || e.key === ',') && state.inputValue.trim()) {
      e.preventDefault();
      addTypedTag(deps);
      return;
    }
    if (e.key === 'Backspace' && !state.inputValue && state.tags.length > 0) {
      removeLastTag(deps);
      return;
    }
    if (e.key === 'Escape') onCancel();
  };
}
