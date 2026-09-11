import { useRef, useState } from 'react';

import {
  orderTagsByFacet,
  planTagCreation,
  rankTagSuggestions,
  resolveTypedTag,
  type TagCreationIntent,
} from '../../lib/tags';
import { makeKeyDownHandler } from './tagEditorKeyDown';
import { SUGGESTION_LIMIT, type TagEditorProps, type TagMetaEntry } from './utils';

export interface PanelHandlers {
  tags: string[];
  inputValue: string;
  /** Suggestions in display order, already capped at `SUGGESTION_LIMIT`. */
  filtered: string[];
  /**
   * Provenance for the tags in `tags` that were added through `onSuggest`,
   * keyed by tag string. A tag typed by hand, or one whose provenance was
   * dropped by removing it, has no entry.
   */
  tagMeta: Map<string, TagMetaEntry>;
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

interface TagState {
  tags: string[];
  /** Provenance for tags added via `onSuggest`, dropped when a tag is removed. */
  meta: Map<string, TagMetaEntry>;
}

function pruneMeta(meta: Map<string, TagMetaEntry>, keep: string[]): Map<string, TagMetaEntry> {
  const keepSet = new Set(keep);
  const next = new Map<string, TagMetaEntry>();
  for (const [tag, entry] of meta) if (keepSet.has(tag)) next.set(tag, entry);
  return next;
}

function useCoreState(currentTags: string[]) {
  const [open, setOpen] = useState(false);
  const [tagState, setTagState] = useState<TagState>({ tags: currentTags, meta: new Map() });
  const [inputValue, setInputValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [prevCurrentTags, setPrevCurrentTags] = useState(currentTags);
  if (currentTags !== prevCurrentTags) {
    setPrevCurrentTags(currentTags);
    setTagState((prev) => ({ tags: currentTags, meta: pruneMeta(prev.meta, currentTags) }));
  }
  // Bridges the combined { tags, meta } state back to the plain
  // string[]-setter shape the key-down handler and manual add/remove paths
  // already expect, so only this hook needs to know tags and their
  // provenance move together.
  const setTags: React.Dispatch<React.SetStateAction<string[]>> = (update) => {
    setTagState((prev) => ({
      ...prev,
      tags:
        typeof update === 'function' ? (update as (p: string[]) => string[])(prev.tags) : update,
    }));
  };
  return {
    open,
    setOpen,
    tags: tagState.tags,
    tagMeta: tagState.meta,
    setTags,
    setTagState,
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
    if (trimmed) s.setTags((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    s.setInputValue('');
    s.inputRef.current?.focus();
  };
  const removeTag = (tag: string) =>
    s.setTagState((prev) => {
      if (!prev.tags.includes(tag)) return prev;
      const meta = new Map(prev.meta);
      meta.delete(tag);
      return { tags: prev.tags.filter((t) => t !== tag), meta };
    });
  const handleCancel = () => {
    s.setTagState((prev) => ({ tags: currentTags, meta: pruneMeta(prev.meta, currentTags) }));
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
  // Suggest merges every candidate straight into the tags, skipping ones
  // already present — unlike autocomplete's one-at-a-time picks, a
  // low-confidence AI guess still lands directly, so its provenance is what
  // lets the panel flag it rather than a review step gating it first.
  const handleSuggest = onSuggest
    ? async () => {
        s.setIsSuggesting(true);
        try {
          const suggestions = await onSuggest();
          s.setTagState((prev) => {
            const additions = suggestions.filter(
              (suggestion) => !prev.tags.includes(suggestion.tag)
            );
            if (additions.length === 0) return prev;
            const meta = new Map(prev.meta);
            for (const addition of additions) {
              meta.set(addition.tag, {
                source: addition.source,
                pattern: addition.pattern,
                isNew: addition.isNew,
              });
            }
            return { tags: [...prev.tags, ...additions.map((addition) => addition.tag)], meta };
          });
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
    tagMeta: s.tagMeta,
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
      onSave: handleSave,
    }),
  };

  // Radix fires this for backdrop clicks and Escape alike, bypassing the
  // panel's own Cancel button — without this, an outside click would close
  // the popover with `s.tags` still holding the unsaved edit, which the
  // trigger renders as if it had been applied.
  const onOpenChange = (next: boolean) => {
    if (next) s.setOpen(true);
    else handleCancel();
  };

  return { open: s.open, setOpen: onOpenChange, tags: s.tags, tagMeta: s.tagMeta, handlers };
}
