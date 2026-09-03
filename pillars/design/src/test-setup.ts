import '@testing-library/jest-dom/vitest';

// jsdom ships neither ResizeObserver nor Element.scrollIntoView; the Radix
// popover and cmdk's Command both reach for one on mount, so a screen built
// from them cannot render in the smoke test without these.
globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
