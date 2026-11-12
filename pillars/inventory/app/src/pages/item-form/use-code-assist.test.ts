import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { codeEntry } from './code-assist';
import { useCodeAssist } from './use-code-assist';

import type { UseCodeAssistOptions } from './use-code-assist';

const mocks = vi.hoisted(() => ({ codesSuggest: vi.fn() }));

vi.mock('../../inventory-api/index.js', () => ({ codesSuggest: mocks.codesSuggest }));
vi.mock('../../inventory-web/useWebSearch.js', () => ({
  useWebSearch: () => ({ status: 'idle', results: { exact: null, items: [] } }),
}));

function options(overrides: Partial<UseCodeAssistOptions> = {}): UseCodeAssistOptions {
  return {
    dispatch: vi.fn(),
    editingId: null,
    entry: codeEntry(),
    name: ' Drill ',
    online: true,
    placement: { kind: 'in-hand' },
    typeKey: null,
    typeLabel: null,
    ...overrides,
  };
}

describe('useCodeAssist suggest', () => {
  beforeEach(() => {
    mocks.codesSuggest.mockReset();
    mocks.codesSuggest.mockResolvedValue({ status: 200, body: { suggestions: ['DRL-001'] } });
  });

  it('sends the sync protocol header, which the server gates codes/suggest on', () => {
    const { result } = renderHook(() => useCodeAssist(options()));
    result.current.suggest();
    expect(mocks.codesSuggest).toHaveBeenCalledTimes(1);
    expect(mocks.codesSuggest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { name: 'Drill' },
        headers: { 'pops-inventory-protocol': expect.stringMatching(/^\d+$/u) },
      })
    );
  });

  it('does not call the server while offline or with a blank name', () => {
    renderHook(() => useCodeAssist(options({ online: false }))).result.current.suggest();
    renderHook(() => useCodeAssist(options({ name: '  ' }))).result.current.suggest();
    expect(mocks.codesSuggest).not.toHaveBeenCalled();
  });
});
