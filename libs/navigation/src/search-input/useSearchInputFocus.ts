import { type RefObject, useState } from 'react';

interface UseSearchInputFocusArgs {
  containerRef: RefObject<HTMLElement | null>;
  setOpen: (open: boolean) => void;
}

interface UseSearchInputFocusResult {
  isFocused: boolean;
  onFocus: () => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
}

/**
 * Tracks whether the search input is focused, opening the panel on focus
 * and clearing focus only when it moves outside the search container
 * (so a click on the dropdown doesn't count as a blur).
 */
export function useSearchInputFocus({
  containerRef,
  setOpen,
}: UseSearchInputFocusArgs): UseSearchInputFocusResult {
  const [isFocused, setIsFocused] = useState(false);

  return {
    isFocused,
    onFocus: () => {
      setIsFocused(true);
      setOpen(true);
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      if (!containerRef.current?.contains(e.relatedTarget as Node)) {
        setIsFocused(false);
      }
    },
  };
}
