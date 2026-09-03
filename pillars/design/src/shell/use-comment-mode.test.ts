import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { commentShortcut, useCommentMode } from './use-comment-mode';

function keydown(
  key: string,
  init: KeyboardEventInit & { target?: EventTarget } = {}
): KeyboardEvent {
  const { target, ...rest } = init;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...rest });
  if (target) Object.defineProperty(event, 'target', { value: target });
  return event;
}

describe('commentShortcut', () => {
  it('maps the toggle key and Escape to their actions', () => {
    expect(commentShortcut(keydown('i'))).toBe('toggle');
    expect(commentShortcut(keydown('Escape'))).toBe('exit');
  });

  it('ignores every other key', () => {
    expect(commentShortcut(keydown('a'))).toBeNull();
    expect(commentShortcut(keydown('Enter'))).toBeNull();
  });

  it('ignores the shortcut while a modifier is held', () => {
    expect(commentShortcut(keydown('i', { metaKey: true }))).toBeNull();
    expect(commentShortcut(keydown('i', { ctrlKey: true }))).toBeNull();
    expect(commentShortcut(keydown('i', { altKey: true }))).toBeNull();
    expect(commentShortcut(keydown('Escape', { ctrlKey: true }))).toBeNull();
  });

  it('ignores the shortcut while typing in a field', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    // jsdom does not compute `isContentEditable` (it depends on layout), so
    // it is set directly here rather than through the `contenteditable`
    // attribute, to exercise the same branch a real browser would take.
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });

    expect(commentShortcut(keydown('i', { target: input }))).toBeNull();
    expect(commentShortcut(keydown('i', { target: textarea }))).toBeNull();
    expect(commentShortcut(keydown('i', { target: select }))).toBeNull();
    expect(commentShortcut(keydown('i', { target: editable }))).toBeNull();
  });
});

describe('useCommentMode', () => {
  it('starts inactive with no open threads', () => {
    const { result } = renderHook(() => useCommentMode());
    expect(result.current.active).toBe(false);
    expect(result.current.openCount).toBe(0);
  });

  it('toggles on the "i" key dispatched on window', () => {
    const { result } = renderHook(() => useCommentMode());
    act(() => {
      window.dispatchEvent(keydown('i'));
    });
    expect(result.current.active).toBe(true);
    act(() => {
      window.dispatchEvent(keydown('i'));
    });
    expect(result.current.active).toBe(false);
  });

  it('exits on Escape', () => {
    const { result } = renderHook(() => useCommentMode());
    act(() => result.current.toggle());
    expect(result.current.active).toBe(true);
    act(() => {
      window.dispatchEvent(keydown('Escape'));
    });
    expect(result.current.active).toBe(false);
  });

  it('does not toggle while typing the letter "i" into a field', () => {
    const input = document.createElement('input');
    document.body.append(input);
    const { result } = renderHook(() => useCommentMode());
    act(() => {
      input.dispatchEvent(keydown('i'));
    });
    expect(result.current.active).toBe(false);
    input.remove();
  });

  it('ignores modifier combinations', () => {
    const { result } = renderHook(() => useCommentMode());
    act(() => {
      window.dispatchEvent(keydown('i', { metaKey: true }));
    });
    expect(result.current.active).toBe(false);
  });
});
