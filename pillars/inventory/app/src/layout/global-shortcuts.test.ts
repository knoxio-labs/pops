import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bindingsFor } from '../foundation/shortcuts/shortcuts';
import { GLOBAL_DESTINATIONS, globalShortcutHandlers } from './global-shortcuts';

describe('globalShortcutHandlers', () => {
  const navigate = vi.fn();
  const openShortcutSheet = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps every go binding to its route, with g a landing on the Sync page's Activity segment", () => {
    const handlers = globalShortcutHandlers({ navigate, openShortcutSheet });
    for (const [id, destination] of Object.entries(GLOBAL_DESTINATIONS)) {
      expect(handlers[id]?.(new KeyboardEvent('keydown')), id).toBe(true);
      expect(navigate).toHaveBeenLastCalledWith(destination);
    }
    expect(GLOBAL_DESTINATIONS['go-activity']).toBe('/inventory/sync?segment=activity');
  });

  it('n and Shift-N open the item form and bulk entry', () => {
    const handlers = globalShortcutHandlers({ navigate, openShortcutSheet });
    expect(handlers['new-item']?.(new KeyboardEvent('keydown', { key: 'n' }))).toBe(true);
    expect(navigate).toHaveBeenLastCalledWith('/inventory/items/new');
    expect(
      handlers['bulk-entry']?.(new KeyboardEvent('keydown', { key: 'N', shiftKey: true }))
    ).toBe(true);
    expect(navigate).toHaveBeenLastCalledWith('/inventory/items/bulk-new');
  });

  it('dismiss blurs a focused input and returns false elsewhere', () => {
    const handlers = globalShortcutHandlers({ navigate, openShortcutSheet });
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    expect(handlers.dismiss?.(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true);
    expect(document.activeElement).toBe(document.body);

    expect(handlers.dismiss?.(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(false);
    input.remove();
  });

  it('leaves palette and search unhandled until their providers are given', () => {
    const handlers = globalShortcutHandlers({ navigate, openShortcutSheet });
    expect(handlers.palette).toBeUndefined();
    expect(handlers.search).toBeUndefined();

    const openPalette = vi.fn();
    const focusSearch = vi.fn();
    const supplied = globalShortcutHandlers({
      navigate,
      openShortcutSheet,
      openPalette,
      focusSearch,
    });
    expect(supplied.palette?.(new KeyboardEvent('keydown'))).toBe(true);
    expect(supplied.search?.(new KeyboardEvent('keydown'))).toBe(true);
    expect(openPalette).toHaveBeenCalledOnce();
    expect(focusSearch).toHaveBeenCalledOnce();
  });

  it('handles every global registry id except palette and search', () => {
    const handlers = globalShortcutHandlers({ navigate, openShortcutSheet });
    for (const { id } of bindingsFor('global')) {
      if (id === 'palette' || id === 'search') continue;
      expect(handlers[id], id).toBeTypeOf('function');
    }
  });

  it('opens the shortcut sheet', () => {
    const handlers = globalShortcutHandlers({ navigate, openShortcutSheet });
    expect(handlers.shortcuts?.(new KeyboardEvent('keydown', { key: '?' }))).toBe(true);
    expect(openShortcutSheet).toHaveBeenCalledOnce();
  });
});
