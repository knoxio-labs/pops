import '@testing-library/jest-dom/vitest';

// jsdom has no layout engine, so it never implements scrollIntoView. Tests
// that render real DOM through useSearchKeyboardNav's scroll-into-view effect
// need it defined or the effect throws.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
