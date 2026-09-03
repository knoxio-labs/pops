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

export type CommentShortcut = 'toggle' | 'exit';

/**
 * The comment-mode action a keydown represents, or null if the shell leaves
 * it alone. Shared by the shell's own listener and the frame's forwarded
 * keydowns (see `FrameToShell`'s `comment-shortcut`) so the typing/modifier
 * guard is not maintained twice.
 */
export function commentShortcut(event: KeyboardEvent): CommentShortcut | null {
  if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return null;
  if (event.key === TOGGLE_KEY) return 'toggle';
  if (event.key === 'Escape') return 'exit';
  return null;
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
      const action = commentShortcut(event);
      if (action === 'toggle') toggle();
      if (action === 'exit') exit();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exit, toggle]);

  return { active, openCount, toggle, exit, setOpenCount };
}
