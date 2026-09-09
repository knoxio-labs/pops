/**
 * The three redirect pages.
 *
 * Three of ai's four routes render nothing but a `<Navigate>` out of the
 * pillar, and where each one points is the whole of its behaviour — a wrong
 * target is a link that quietly lands somewhere else rather than anything that
 * looks broken. They are also the pages a reader is least likely to open while
 * working on this app, so nothing else would notice.
 *
 * Driven through `PAGE_COMPONENTS` rather than by importing the components
 * directly: that record is what the shell's runtime loader resolves a bundle
 * slot to, so this asserts the thing that actually mounts.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';

import { PAGE_COMPONENTS } from '../routes';

/** Reports where the router ended up, hash included. */
function LocationProbe() {
  const { pathname, hash } = useLocation();
  return <div data-testid="location">{`${pathname}${hash}`}</div>;
}

/** Mount one slot's component at `from` and return where it navigated to. */
function destinationOf(slot: keyof typeof PAGE_COMPONENTS, from: string): string {
  const Component = PAGE_COMPONENTS[slot];
  render(
    <MemoryRouter initialEntries={[from]}>
      <LocationProbe />
      <Routes>
        <Route path="/ai/*" element={<Component />} />
        <Route path="*" element={<div />} />
      </Routes>
    </MemoryRouter>
  );
  return screen.getByTestId('location').textContent ?? '';
}

describe('ai redirect pages', () => {
  // The destination, not merely "it redirected": the second is true of a
  // redirect pointing anywhere at all.
  it.each([
    ['ai-prompts', '/finance/prompts', '/ai/prompts'],
    ['ai-config', '/settings#ai.config', '/ai/config'],
    ['ai-rules', '/finance/rules', '/ai/rules'],
  ] as const)('%s sends the reader to %s', (slot, expected, from) => {
    expect(destinationOf(slot, from)).toBe(expected);
  });

  // The settings target carries a fragment, which is what selects the panel
  // once the page loads. A redirect that dropped it would land on settings
  // and look almost right.
  it('keeps the fragment on the settings redirect', () => {
    expect(destinationOf('ai-config', '/ai/config')).toContain('#ai.config');
  });

  // Binding two slots to one redirect would send two links to the same place
  // and look perfectly fine on the rail.
  it('binds a distinct component to each redirect slot', () => {
    const redirects = [
      PAGE_COMPONENTS['ai-prompts'],
      PAGE_COMPONENTS['ai-config'],
      PAGE_COMPONENTS['ai-rules'],
    ];
    expect(new Set(redirects).size).toBe(3);
  });
});
