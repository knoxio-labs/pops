import { type KeyboardEvent, useMemo, useState } from 'react';

import { useChipInput, type UseChipInputArgs } from './ChipInput.hooks';

export interface ChipInputSuggestion {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface UseChipInputSuggestionsArgs extends UseChipInputArgs {
  suggestions: ChipInputSuggestion[];
  normalize: (raw: string) => string;
}

function defaultNormalize(raw: string): string {
  return raw.trim();
}

function filterSuggestions(
  suggestions: ChipInputSuggestion[],
  query: string,
  selected: string[]
): ChipInputSuggestion[] {
  const lower = query.trim().toLowerCase();
  const available = suggestions.filter((s) => !selected.includes(s.value));
  if (!lower) return available;
  return available.filter(
    (s) => s.label.toLowerCase().includes(lower) || s.value.toLowerCase().includes(lower)
  );
}

interface KeyDownDeps {
  open: boolean;
  setOpen: (v: boolean) => void;
  hasSuggestions: boolean;
  inputValue: string;
  hasSelectableMatch: boolean;
  commit: (raw: string) => void;
  fallbackKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Enter, when the dropdown is open, either lets cmdk's Command root select
 * the highlighted suggestion (left alone) or — when nothing matches what
 * was typed — commits it as a free-text chip ourselves, since cmdk would
 * otherwise call `preventDefault()` on Enter and find nothing selected.
 * ArrowDown/Up open a closed dropdown instead of doing nothing.
 */
function makeSuggestionsKeyDownHandler(deps: KeyDownDeps) {
  return (e: KeyboardEvent<HTMLInputElement>) => {
    const {
      open,
      setOpen,
      hasSuggestions,
      inputValue,
      hasSelectableMatch,
      commit,
      fallbackKeyDown,
    } = deps;

    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      if (!hasSuggestions) return;
      e.preventDefault();
      setOpen(true);
      return;
    }

    if (e.key === 'Enter') {
      if (!open) {
        fallbackKeyDown(e);
        return;
      }
      const trimmed = inputValue.trim();
      if (trimmed && !hasSelectableMatch) {
        e.preventDefault();
        e.stopPropagation();
        commit(trimmed);
      }
      return;
    }

    fallbackKeyDown(e);
  };
}

export function useChipInputSuggestions({
  suggestions,
  normalize = defaultNormalize,
  ...chipArgs
}: UseChipInputSuggestionsArgs) {
  const chip = useChipInput(chipArgs);
  const [open, setOpen] = useState(false);

  const filtered = useMemo(
    () => filterSuggestions(suggestions, chip.inputValue, chip.values),
    [suggestions, chip.inputValue, chip.values]
  );
  const hasSelectableMatch = useMemo(() => filtered.some((s) => !s.disabled), [filtered]);

  const commit = (raw: string) => {
    const normalized = normalize(raw);
    if (!normalized) return;
    chip.addChip(normalized);
  };

  const pickSuggestion = (suggestion: ChipInputSuggestion) => {
    if (suggestion.disabled) return;
    commit(suggestion.value);
  };

  const openIfHasSuggestions = () => {
    if (suggestions.length > 0) setOpen(true);
  };

  const handleKeyDown = makeSuggestionsKeyDownHandler({
    open,
    setOpen,
    hasSuggestions: suggestions.length > 0,
    inputValue: chip.inputValue,
    hasSelectableMatch,
    commit,
    fallbackKeyDown: chip.handleKeyDown,
  });

  return {
    ...chip,
    open,
    setOpen,
    filtered,
    commit,
    pickSuggestion,
    openIfHasSuggestions,
    handleKeyDown,
    handleInputChange: (next: string) => {
      chip.setInputValue(next);
      openIfHasSuggestions();
    },
    handleFocus: () => {
      chip.setIsFocused(true);
      openIfHasSuggestions();
    },
    handleBlur: () => chip.setIsFocused(false),
  };
}
