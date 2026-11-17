import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useWideWorkspace } from './use-breakpoint';

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty('--breakpoint-xl');
  vi.unstubAllGlobals();
});

function Workspace() {
  return <p>{useWideWorkspace() ? 'Rail' : 'Compact'}</p>;
}

it('reads the shared theme breakpoint rather than inventing a numeric width', () => {
  document.documentElement.style.setProperty('--breakpoint-xl', '86rem');
  const media: MediaQueryList = {
    matches: true,
    media: '(min-width: 86rem)',
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
  };
  const matchMedia = vi.fn(() => media);
  vi.stubGlobal('matchMedia', matchMedia);
  render(<Workspace />);
  expect(screen.getByText('Rail')).toBeVisible();
  expect(matchMedia).toHaveBeenCalledWith('(min-width: 86rem)');
});

it('does not claim desktop space when the shared theme breakpoint is unavailable', () => {
  const matchMedia = vi.fn();
  vi.stubGlobal('matchMedia', matchMedia);
  render(<Workspace />);
  expect(screen.getByText('Compact')).toBeVisible();
  expect(matchMedia).not.toHaveBeenCalled();
});
