import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrameShell } from './FrameShell';

import type { FrameToShell } from './viewport';

vi.mock('../comments/CommentsOverlay', () => ({
  CommentsOverlay: () => null,
}));

vi.mock('../frames/FrameChrome', () => ({
  FrameChrome: ({ children }: { children: React.ReactNode }) => children,
}));

function commentShortcutMessages(postMessage: ReturnType<typeof vi.fn>): FrameToShell[] {
  return postMessage.mock.calls
    .map(([message]) => message as FrameToShell)
    .filter((message) => message.kind === 'comment-shortcut');
}

describe('FrameShell keyboard forwarding', () => {
  let postMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    postMessage = vi.fn();
    Object.defineProperty(window, 'parent', {
      value: { postMessage },
      writable: true,
      configurable: true,
    });
    render(
      <MemoryRouter initialEntries={['/frame/s/finance/accounts']}>
        <FrameShell />
      </MemoryRouter>
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // The shell's own `keydown` listener lives on the shell's window, which
  // never sees a keystroke once focus has moved into this same-origin
  // iframe — exactly what happens the moment someone clicks the surface
  // they want to comment on. This is the crossing that makes `i` and
  // `Escape` work again from in here.
  it('forwards the toggle key typed in this document up to the shell', () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'i', bubbles: true, cancelable: true })
    );
    expect(commentShortcutMessages(postMessage)).toEqual([
      { kind: 'comment-shortcut', action: 'toggle' },
    ]);
  });

  it('forwards Escape up to the shell', () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
    expect(commentShortcutMessages(postMessage)).toEqual([
      { kind: 'comment-shortcut', action: 'exit' },
    ]);
  });

  it('does not forward the toggle key while typing in a field inside the frame', () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'i', bubbles: true, cancelable: true })
    );
    expect(commentShortcutMessages(postMessage)).toEqual([]);
    input.remove();
  });

  it('does not forward a modified keystroke', () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'i',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    expect(commentShortcutMessages(postMessage)).toEqual([]);
  });
});
