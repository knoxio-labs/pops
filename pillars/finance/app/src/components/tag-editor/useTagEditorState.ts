import { useEffect, useRef, useState } from 'react';

import {
  orderTagsByFacet,
  planTagCreation,
  rankTagSuggestions,
  resolveTypedTag,
  type TagCreationIntent,
} from '../../lib/tags';
import { SUGGESTION_LIMIT, type TagEditorProps } from './utils';

export interface PanelHandlers {
  tags: string[];
  inputValue: string;
  /** Suggestions in display order, already capped at `SUGGESTION_LIMIT`. */
  filtered: string[];
  /** What the typed text would create, driving the panel's create row. */
  creation: TagCreationIntent;
  isSaving: boolean;
  isSuggesting: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  setInputValue: (v: string) => void;
  onSave: () => void;
  onSuggest?: () => void;
  onCancel: () => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

interface CoreState {
  tags: string[];
  setTags: React.Dispatch<React.SetStateAction<string[]>>;
  inputValue: string;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

interface KeyDownDeps {
  state: CoreState;
  filtered: string[];
  availableTags: string[];
  creation: TagCreationIntent;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onCancel: () => void;
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

function makeKeyDownHandler(deps: KeyDownDeps) {
  const { state, filtered, onCancel } = deps;
  return (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && filtered.length > 0) {
      e.preventDefault();
      completeFirstSuggestion(deps);
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

function useCoreState(currentTags: string[]) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<string[]>(currentTags);
  const [inputValue, setInputValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setTags(currentTags), [currentTags]);
  return {
    open,
    setOpen,
    tags,
    setTags,
    inputValue,
    setInputValue,
    isSaving,
    setIsSaving,
    isSuggesting,
    setIsSuggesting,
    inputRef,
  };
}

type CoreStateBag = ReturnType<typeof useCoreState>;

interface ActionsArgs {
  s: CoreStateBag;
  currentTags: string[];
  onSave: TagEditorProps['onSave'];
  onSuggest: TagEditorProps['onSuggest'];
}

function useTagActions({ s, currentTags, onSave, onSuggest }: ActionsArgs) {
  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !s.tags.includes(trimmed)) s.setTags((prev) => [...prev, trimmed]);
    s.setInputValue('');
    s.inputRef.current?.focus();
  };
  const removeTag = (tag: string) => s.setTags((prev) => prev.filter((t) => t !== tag));
  const handleCancel = () => {
    s.setTags(currentTags);
    s.setInputValue('');
    s.setOpen(false);
  };
  const handleSave = async () => {
    s.setIsSaving(true);
    try {
      await onSave(s.tags);
      s.setOpen(false);
    } finally {
      s.setIsSaving(false);
    }
  };
  const handleSuggest = onSuggest
    ? async () => {
        s.setIsSuggesting(true);
        try {
          const suggested = await onSuggest();
          s.setTags((prev) => [...prev, ...suggested.filter((t) => !prev.includes(t))]);
        } finally {
          s.setIsSuggesting(false);
        }
      }
    : undefined;
  return { addTag, removeTag, handleCancel, handleSave, handleSuggest };
}

export function useTagEditorState(props: TagEditorProps) {
  const { currentTags, onSave, onSuggest, availableTags = [], facets = [] } = props;
  const s = useCoreState(currentTags);
  // Relevance picks the shortlist, then facet grouping fixes its order, so
  // what Tab completes is always what the panel shows first.
  const filtered = orderTagsByFacet(
    rankTagSuggestions(s.inputValue, availableTags, s.tags).slice(0, SUGGESTION_LIMIT)
  ).map((parsed) => parsed.raw);
  const creation =
    resolveTypedTag(s.inputValue, availableTags) === undefined
      ? planTagCreation(s.inputValue, facets)
      : ({ kind: 'none' } as const);
  const { addTag, removeTag, handleCancel, handleSave, handleSuggest } = useTagActions({
    s,
    currentTags,
    onSave,
    onSuggest,
  });

  const handlers: PanelHandlers = {
    tags: s.tags,
    inputValue: s.inputValue,
    filtered,
    creation,
    isSaving: s.isSaving,
    isSuggesting: s.isSuggesting,
    inputRef: s.inputRef,
    setInputValue: s.setInputValue,
    onSave: handleSave,
    onSuggest: handleSuggest,
    onCancel: handleCancel,
    onAddTag: addTag,
    onRemoveTag: removeTag,
    onKeyDown: makeKeyDownHandler({
      state: {
        tags: s.tags,
        setTags: s.setTags,
        inputValue: s.inputValue,
        setInputValue: s.setInputValue,
        inputRef: s.inputRef,
      },
      filtered,
      availableTags,
      creation,
      onAddTag: addTag,
      onRemoveTag: removeTag,
      onCancel: handleCancel,
    }),
  };
  return { open: s.open, setOpen: s.setOpen, tags: s.tags, handlers };
}
