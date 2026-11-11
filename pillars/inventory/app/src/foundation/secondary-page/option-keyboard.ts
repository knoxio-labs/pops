import type { KeyboardEvent } from 'react';

/** Activates an enabled option on Enter/Space without handling its nested controls. */
export function activateOptionOnKeyDown(
  event: KeyboardEvent<HTMLElement>,
  refused: boolean,
  activate: () => void
): void {
  if (event.target !== event.currentTarget || refused) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    activate();
  }
}
