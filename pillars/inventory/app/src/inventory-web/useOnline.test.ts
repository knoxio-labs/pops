import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useOnline } from './useOnline';

const originalOnline = navigator.onLine;

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnline });
});

describe('useOnline', () => {
  it('reads navigator.onLine and follows online and offline events', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(false);

    act(() => window.dispatchEvent(new Event('online')));
    expect(result.current).toBe(true);

    act(() => window.dispatchEvent(new Event('offline')));
    expect(result.current).toBe(false);
  });
});
