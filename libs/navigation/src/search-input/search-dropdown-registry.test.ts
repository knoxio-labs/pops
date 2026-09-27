import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  _clearSearchDropdowns,
  focusGlobalSearch,
  registerGlobalSearchInput,
  registerSearchDropdown,
  useSearchDropdown,
} from './search-dropdown-registry';

import type { ComponentType } from 'react';

import type { SearchDropdownProps } from './search-dropdown-registry';

const Dropdown: ComponentType<SearchDropdownProps> = () => null;

afterEach(() => {
  _clearSearchDropdowns();
  vi.resetModules();
});

describe('search dropdown registry', () => {
  it('returns the registration for its app and null for others', () => {
    const registration = { Dropdown };
    const { result } = renderHook(() => useSearchDropdown('inventory'));

    expect(result.current).toBeNull();
    act(() => registerSearchDropdown('inventory', registration));
    expect(result.current).toBe(registration);

    const { result: other } = renderHook(() => useSearchDropdown('finance'));
    expect(other.current).toBeNull();
  });

  it('a second copy of the module sees the registrations and the input made through the first', async () => {
    const first = await import('./search-dropdown-registry');
    first._clearSearchDropdowns();
    const input = document.createElement('input');
    const focus = vi.spyOn(input, 'focus');

    first.registerSearchDropdown('inventory', { Dropdown });
    first.registerGlobalSearchInput(input);
    vi.resetModules();
    const second = await import('./search-dropdown-registry');
    const { result } = renderHook(() => second.useSearchDropdown('inventory'));

    expect(result.current?.Dropdown).toBe(Dropdown);
    expect(second.focusGlobalSearch()).toBe(true);
    expect(focus).toHaveBeenCalledOnce();
  });

  it('a stale unregister leaves a newer registration in place', () => {
    const first = { Dropdown };
    const second = { Dropdown };
    const unregisterFirst = registerSearchDropdown('inventory', first);
    registerSearchDropdown('inventory', second);

    unregisterFirst();

    const { result } = renderHook(() => useSearchDropdown('inventory'));
    expect(result.current).toBe(second);
  });

  it('focusGlobalSearch focuses the input registered with registerGlobalSearchInput and returns false with none', () => {
    expect(focusGlobalSearch()).toBe(false);

    const input = document.createElement('input');
    const focus = vi.spyOn(input, 'focus');
    registerGlobalSearchInput(input);

    expect(focusGlobalSearch()).toBe(true);
    expect(focus).toHaveBeenCalledOnce();
  });

  it('the last registered input wins and a stale unregister leaves it registered', () => {
    const first = document.createElement('input');
    const second = document.createElement('input');
    const firstFocus = vi.spyOn(first, 'focus');
    const secondFocus = vi.spyOn(second, 'focus');
    const unregisterFirst = registerGlobalSearchInput(first);
    registerGlobalSearchInput(second);

    unregisterFirst();
    expect(focusGlobalSearch()).toBe(true);
    expect(firstFocus).not.toHaveBeenCalled();
    expect(secondFocus).toHaveBeenCalledOnce();
  });

  it('_clearSearchDropdowns clears the registrations, the listeners and the input', () => {
    const { result } = renderHook(() => useSearchDropdown('inventory'));
    registerSearchDropdown('inventory', { Dropdown });
    registerGlobalSearchInput(document.createElement('input'));

    act(() => _clearSearchDropdowns());

    expect(result.current).toBeNull();
    expect(focusGlobalSearch()).toBe(false);
  });
});
