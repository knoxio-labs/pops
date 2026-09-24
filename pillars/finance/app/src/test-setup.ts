import '@testing-library/jest-dom/vitest';

import { createFinanceI18n } from './app-i18n';

// jsdom ships neither ResizeObserver nor Element.scrollIntoView; cmdk and the
// Radix popover/select primitives use both on mount.
globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

createFinanceI18n();
