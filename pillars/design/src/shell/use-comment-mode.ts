/**
 * Comment mode as the shell sees it: a boolean it owns, an open-thread count
 * the frame reports back, and the `i` shortcut that toggles it.
 *
 * The shell owns the boolean rather than the frame because the dock button
 * lives out here, and a frame reload must not silently turn comment mode off
 * — `ViewportFrame` re-sends it on every `ready`.
 */
import { useCallback, useEffect, useState } from 'react';

const TOGGLE_KEY = 'i';

/** Whether a keystroke landed somewhere that wants the letter itself. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export interface CommentMode {
  active: boolean;
  openCount: number;
  toggle: () => void;
  exit: () => void;
  setOpenCount: (open: number) => void;
}

export function useCommentMode(): CommentMode {
  const [active, setActive] = useState(false);
  const [openCount, setOpenCount] = useState(0);

  const toggle = useCallback(() => setActive((value) => !value), []);
  const exit = useCallback(() => setActive(false), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (event.key === TOGGLE_KEY) toggle();
      if (event.key === 'Escape') exit();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exit, toggle]);

  return { active, openCount, toggle, exit, setOpenCount };
}
