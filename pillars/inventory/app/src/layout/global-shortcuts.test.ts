import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GLOBAL_DESTINATIONS, globalShortcutHandlers } from './global-shortcuts';

describe('globalShortcutHandlers', () => {
  const navigate = vi.fn();
  const openShortcutSheet = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps every destination to its route', () => {
    const handlers = globalShortcutHandlers({ navigate, openShortcutSheet });
    for (const [id, path] of Object.entries(GLOBAL_DESTINATIONS)) {
      expect(handlers[id]?.(new KeyboardEvent('keydown'))).toBe(true);
      expect(navigate).toHaveBeenLastCalledWith(path);
    }
  });

  it('opens the shortcut sheet and leaves optional handlers absent', () => {
    const handlers = globalShortcutHandlers({ navigate, openShortcutSheet });
    expect(handlers.shortcuts?.(new KeyboardEvent('keydown'))).toBe(true);
    expect(openShortcutSheet).toHaveBeenCalledOnce();
    expect(handlers.palette).toBeUndefined();
    expect(handlers.search).toBeUndefined();
  });

  it('handles optional palette and search dependencies when supplied', () => {
    const openPalette = vi.fn();
    const focusSearch = vi.fn();
    const handlers = globalShortcutHandlers({
      navigate,
      openShortcutSheet,
      openPalette,
      focusSearch,
    });
    expect(handlers.palette?.(new KeyboardEvent('keydown'))).toBe(true);
    expect(handlers.search?.(new KeyboardEvent('keydown'))).toBe(true);
    expect(openPalette).toHaveBeenCalledOnce();
    expect(focusSearch).toHaveBeenCalledOnce();
  });

  it('blurs a focused text field and leaves Escape alone elsewhere', () => {
    const handlers = globalShortcutHandlers({ navigate, openShortcutSheet });
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    expect(handlers.dismiss?.(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true);
    expect(document.activeElement).toBe(document.body);

    expect(handlers.dismiss?.(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(false);
    input.remove();
  });
});
