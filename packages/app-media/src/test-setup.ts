import '@testing-library/jest-dom/vitest';

// jsdom does not implement ResizeObserver, but Radix UI's react-use-size hook
// requires it. Provide a no-op stub so Tooltip/Popover components don't crash.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverStub;
