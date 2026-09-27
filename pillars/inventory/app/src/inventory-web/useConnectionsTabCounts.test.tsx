import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useConnectionsRegistry: vi.fn(),
  useFixtures: vi.fn(),
}));

vi.mock('./useConnectionsRegistry.js', () => ({
  useConnectionsRegistry: (...args: unknown[]) => mocks.useConnectionsRegistry(...args),
}));

vi.mock('./useFixtures.js', () => ({
  useFixtures: (...args: unknown[]) => mocks.useFixtures(...args),
}));

import { useConnectionsTabCounts } from './useConnectionsTabCounts.js';

describe('useConnectionsTabCounts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.useConnectionsRegistry.mockReturnValue({ summary: null });
    mocks.useFixtures.mockReturnValue({ total: null });
  });

  it('gives the unfiltered connection and fixture counts, null until loaded', () => {
    const { result, rerender } = renderHook(() => useConnectionsTabCounts());

    expect(result.current).toEqual({ connections: null, fixtures: null });
    expect(mocks.useConnectionsRegistry).toHaveBeenCalledWith({ kind: 'all', q: '' });
    expect(mocks.useFixtures).toHaveBeenCalledWith({
      search: '',
      type: null,
      withinLocationId: null,
    });

    mocks.useConnectionsRegistry.mockReturnValue({ summary: { connections: 12 } });
    mocks.useFixtures.mockReturnValue({ total: 4 });
    rerender();

    expect(result.current).toEqual({ connections: 12, fixtures: 4 });
  });
});
