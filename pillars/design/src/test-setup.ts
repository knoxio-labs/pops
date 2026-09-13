import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom ships neither ResizeObserver nor Element.scrollIntoView; the Radix
// popover and cmdk's Command both reach for one on mount, so a screen built
// from them cannot render in the smoke test without these.
globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

// `@pops/ui`'s Toaster resolves the theme through next-themes, which reads
// `matchMedia` on mount, and jsdom does not implement it. A screen that
// reproduces the app's toast feedback cannot mount in the smoke test without
// this. Reports "not dark" so the toaster resolves to the same theme every run.
globalThis.matchMedia ??= (query: string): MediaQueryList =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) satisfies MediaQueryList;

// This project sets no `globals`, so React Testing Library never finds a
// global `afterEach` to register its automatic cleanup with. Without this,
// every component and hook rendered by a test stays mounted for the rest of
// the file, and anything it attached to `document` or `window` keeps firing
// in later tests (POPS-2806).
afterEach(() => {
  cleanup();
});
