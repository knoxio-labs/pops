import { screen } from '@testing-library/react';

/** Find a source retry without borrowing an independent Documents recovery action. */
export function querySourceRetry(): HTMLElement | null {
  const buttons = screen
    .queryAllByRole('button', { name: /^Try again$/i })
    .filter((button) => button.closest('[aria-label="Source documents"]') === null);
  if (buttons.length > 1)
    throw new Error(`Expected at most one source retry, found ${buttons.length}.`);
  return buttons[0] ?? null;
}

/** Require exactly one source retry; independent Documents recovery stays visible and actionable. */
export function getSourceRetry(): HTMLElement {
  const button = querySourceRetry();
  if (button === null) throw new Error('Expected a source retry.');
  return button;
}
