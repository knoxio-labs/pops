/**
 * useFocusTrap — traps Tab/Shift+Tab focus within a container element.
 *
 * When `active` is true, Tab cycles forward and Shift+Tab cycles backward
 * through all focusable descendants of `containerRef`. Focus never leaves
 * the container while the trap is active.
 *
 * When `active` becomes false the trap is removed — the caller is responsible
 * for restoring focus to an appropriate element if needed.
 */
import { type RefObject, useEffect } from 'react';

/** CSS selector that matches all natively focusable elements. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.closest('[hidden]') && !el.closest('[aria-hidden="true"]')
  );
}

interface UseFocusTrapOptions {
  /** Ref to the container that should trap focus. */
  containerRef: RefObject<HTMLElement | null>;
  /** Whether the trap is currently active. */
  active: boolean;
}

export function useFocusTrap({ containerRef, active }: UseFocusTrapOptions): void {
  useEffect(() => {
    if (!active) return;

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      const currentFocus = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        // Shift+Tab: if focus is on or before the first element, wrap to last
        if (!currentFocus || currentFocus === first || !container.contains(currentFocus)) {
          event.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if focus is on or after the last element, wrap to first
        if (!currentFocus || currentFocus === last || !container.contains(currentFocus)) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [active, containerRef]);
}
