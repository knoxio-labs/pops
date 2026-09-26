import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ShortcutProvider, useShortcutScope } from './shortcut-provider';

import type { ReactElement } from 'react';

import type { ShortcutHandlers } from './shortcut-provider';

type PageScope = 'list' | 'detail' | 'form';

function Scope({ scope, handlers }: { scope: PageScope; handlers: ShortcutHandlers }): null {
  useShortcutScope(scope, handlers);
  return null;
}

function Provider({
  globalHandlers,
  scope,
  handlers,
}: {
  globalHandlers?: ShortcutHandlers;
  scope?: PageScope;
  handlers?: ShortcutHandlers;
}): ReactElement {
  return (
    <ShortcutProvider globalHandlers={globalHandlers ?? {}}>
      {scope === undefined ? null : <Scope scope={scope} handlers={handlers ?? {}} />}
    </ShortcutProvider>
  );
}

function key(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  cleanup();
});

describe('ShortcutProvider', () => {
  it('fires the global handler for g then i, and nothing for i alone', () => {
    const goItems = vi.fn();
    const { container } = render(<Provider globalHandlers={{ 'go-items': goItems }} />);

    const first = key(container, { key: 'i' });
    expect(first.defaultPrevented).toBe(false);
    expect(goItems).not.toHaveBeenCalled();

    key(container, { key: 'g' });
    const second = key(container, { key: 'i' });
    expect(second.defaultPrevented).toBe(true);
    expect(goItems).toHaveBeenCalledOnce();
  });

  it('does not prevent the g that arms a sequence', () => {
    const goItems = vi.fn();
    const { container } = render(<Provider globalHandlers={{ 'go-items': goItems }} />);

    const first = key(container, { key: 'g' });
    expect(first.defaultPrevented).toBe(false);
    expect(goItems).not.toHaveBeenCalled();

    const second = key(container, { key: 'i' });
    expect(second.defaultPrevented).toBe(true);
    expect(goItems).toHaveBeenCalledOnce();
  });

  it('on the detail scope, g then c goes to Containers and does not copy the code', () => {
    const goContainers = vi.fn();
    const copyCode = vi.fn();
    const { container } = render(
      <Provider
        globalHandlers={{ 'go-containers': goContainers }}
        scope="detail"
        handlers={{ 'detail-copy-code': copyCode }}
      />
    );

    key(container, { key: 'g' });
    const event = key(container, { key: 'c' });
    expect(event.defaultPrevented).toBe(true);
    expect(goContainers).toHaveBeenCalledOnce();
    expect(copyCode).not.toHaveBeenCalled();
  });

  it('ignores plain keys typed in an input but fires Mod+Enter there', () => {
    const save = vi.fn();
    const { container } = render(<Provider scope="form" handlers={{ 'form-save': save }} />);
    const input = document.createElement('input');
    container.append(input);

    const plain = key(input, { key: 'n' });
    expect(plain.defaultPrevented).toBe(false);
    expect(save).not.toHaveBeenCalled();

    const submit = key(input, { key: 'Enter', metaKey: true });
    expect(submit.defaultPrevented).toBe(true);
    expect(save).toHaveBeenCalledOnce();
  });

  it('ignores Enter in an input even when the form scope registers form-accept-code', () => {
    const acceptCode = vi.fn();
    const { container } = render(
      <Provider scope="form" handlers={{ 'form-accept-code': acceptCode }} />
    );
    const input = document.createElement('input');
    container.append(input);

    const event = key(input, { key: 'Enter' });
    expect(event.defaultPrevented).toBe(false);
    expect(acceptCode).not.toHaveBeenCalled();
  });

  it('leaves Mod+A to a focused input even when the list scope registers list-all', () => {
    const listAll = vi.fn();
    const { container } = render(<Provider scope="list" handlers={{ 'list-all': listAll }} />);
    const input = document.createElement('input');
    container.append(input);

    const event = key(input, { key: 'a', metaKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(listAll).not.toHaveBeenCalled();
  });

  it('leaves Mod+Z and Mod+K to a focused input even when undo and palette handlers are registered', () => {
    const undo = vi.fn();
    const palette = vi.fn();
    const { container } = render(<Provider globalHandlers={{ undo, palette }} />);
    const input = document.createElement('input');
    container.append(input);

    const undoEvent = key(input, { key: 'z', metaKey: true });
    const paletteEvent = key(input, { key: 'k', metaKey: true });
    expect(undoEvent.defaultPrevented).toBe(false);
    expect(paletteEvent.defaultPrevented).toBe(false);
    expect(undo).not.toHaveBeenCalled();
    expect(palette).not.toHaveBeenCalled();
  });

  it('fires dismiss on Escape from a focused input', () => {
    const dismiss = vi.fn();
    const { container } = render(<Provider globalHandlers={{ dismiss }} />);
    const input = document.createElement('input');
    container.append(input);

    const event = key(input, { key: 'Escape' });
    expect(event.defaultPrevented).toBe(true);
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it('leaves the event unprevented when no handler is registered', () => {
    const { container } = render(<Provider scope="list" />);

    const event = key(container, { key: 'j' });
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves the event unprevented when the handler returns false', () => {
    const handler = vi.fn(() => false);
    const { container } = render(<Provider globalHandlers={{ 'go-items': handler }} />);

    key(container, { key: 'g' });
    const event = key(container, { key: 'i' });
    expect(event.defaultPrevented).toBe(false);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('falls back to the global dismiss when the list scope dismiss returns false', () => {
    const scopedDismiss = vi.fn(() => false);
    const globalDismiss = vi.fn();
    const { container } = render(
      <Provider
        globalHandlers={{ dismiss: globalDismiss }}
        scope="list"
        handlers={{ dismiss: scopedDismiss }}
      />
    );

    const event = key(container, { key: 'Escape' });
    expect(event.defaultPrevented).toBe(true);
    expect(scopedDismiss).toHaveBeenCalledOnce();
    expect(globalDismiss).toHaveBeenCalledOnce();
  });

  it('does not run the global dismiss when the list scope dismiss handles Escape', () => {
    const scopedDismiss = vi.fn();
    const globalDismiss = vi.fn();
    const { container } = render(
      <Provider
        globalHandlers={{ dismiss: globalDismiss }}
        scope="list"
        handlers={{ dismiss: scopedDismiss }}
      />
    );

    const event = key(container, { key: 'Escape' });
    expect(event.defaultPrevented).toBe(true);
    expect(scopedDismiss).toHaveBeenCalledOnce();
    expect(globalDismiss).not.toHaveBeenCalled();
  });

  it('leaves the event unprevented when the scope and global handlers both return false', () => {
    const scopedDismiss = vi.fn(() => false);
    const globalDismiss = vi.fn(() => false);
    const { container } = render(
      <Provider
        globalHandlers={{ dismiss: globalDismiss }}
        scope="list"
        handlers={{ dismiss: scopedDismiss }}
      />
    );

    const event = key(container, { key: 'Escape' });
    expect(event.defaultPrevented).toBe(false);
    expect(scopedDismiss).toHaveBeenCalledOnce();
    expect(globalDismiss).toHaveBeenCalledOnce();
  });

  it('ignores an event a list grid already prevented', () => {
    const handler = vi.fn();
    const { container } = render(<Provider globalHandlers={{ 'list-down': handler }} />);
    const event = new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true });
    event.preventDefault();
    container.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('restores the previous scope when a page scope unmounts', () => {
    const listHandler = vi.fn();
    const detailHandler = vi.fn();

    function Scopes({ showDetail }: { showDetail: boolean }): ReactElement | null {
      return (
        <>
          <Scope scope="list" handlers={{ 'pick-up': listHandler }} />
          {showDetail ? (
            <Scope scope="detail" handlers={{ 'detail-place': detailHandler }} />
          ) : null}
        </>
      );
    }

    const { rerender } = render(
      <ShortcutProvider globalHandlers={{}}>
        <Scopes showDetail />
      </ShortcutProvider>
    );

    key(document.body, { key: 'p' });
    expect(detailHandler).toHaveBeenCalledOnce();
    expect(listHandler).not.toHaveBeenCalled();

    rerender(
      <ShortcutProvider globalHandlers={{}}>
        <Scopes showDetail={false} />
      </ShortcutProvider>
    );
    key(document.body, { key: 'p' });
    expect(listHandler).toHaveBeenCalledOnce();
  });

  it('throws when useShortcutScope is used outside ShortcutProvider', () => {
    function OutsideProvider(): null {
      useShortcutScope('list', {});
      return null;
    }

    expect(() => render(<OutsideProvider />)).toThrow(
      'useShortcutScope must be used inside ShortcutProvider'
    );
  });

  it('takes Mod+K for the palette before a document-level Mod+K listener registered first', () => {
    const shellSearch = vi.fn((event: KeyboardEvent) => event.preventDefault());
    document.addEventListener('keydown', shellSearch);
    const palette = vi.fn();
    const { container } = render(<Provider globalHandlers={{ palette }} />);

    const event = key(container, { key: 'k', metaKey: true });
    expect(palette).toHaveBeenCalledOnce();
    expect(shellSearch).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    document.removeEventListener('keydown', shellSearch);
  });

  it('leaves Mod+K to a document-level listener when no palette handler is registered', () => {
    const shellSearch = vi.fn((event: KeyboardEvent) => event.preventDefault());
    document.addEventListener('keydown', shellSearch);
    const { container } = render(<Provider />);

    const event = key(container, { key: 'k', metaKey: true });
    expect(shellSearch).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    document.removeEventListener('keydown', shellSearch);
  });

  it('leaves Mod+K to a document-level listener when the palette handler returns false', () => {
    const shellSearch = vi.fn((event: KeyboardEvent) => event.preventDefault());
    document.addEventListener('keydown', shellSearch);
    const palette = vi.fn(() => false);
    const { container } = render(<Provider globalHandlers={{ palette }} />);

    key(container, { key: 'k', metaKey: true });
    expect(palette).toHaveBeenCalledOnce();
    expect(shellSearch).toHaveBeenCalledOnce();
    document.removeEventListener('keydown', shellSearch);
  });

  it('leaves Mod+K to a document-level listener from a focused input', () => {
    const shellSearch = vi.fn((event: KeyboardEvent) => event.preventDefault());
    document.addEventListener('keydown', shellSearch);
    const palette = vi.fn();
    const { container } = render(<Provider globalHandlers={{ palette }} />);
    const input = document.createElement('input');
    container.append(input);

    key(input, { key: 'k', metaKey: true });
    expect(palette).not.toHaveBeenCalled();
    expect(shellSearch).toHaveBeenCalledOnce();
    document.removeEventListener('keydown', shellSearch);
  });

  it('leaves Mod+Shift+K to the shell capture hotkey', () => {
    const captureHotkey = vi.fn((event: KeyboardEvent) => event.preventDefault());
    const propagation = vi.fn();
    window.addEventListener('keydown', captureHotkey);
    document.addEventListener('keydown', propagation);
    const palette = vi.fn();
    const { container } = render(<Provider globalHandlers={{ palette }} />);

    key(container, { key: 'K', metaKey: true, shiftKey: true });
    expect(palette).not.toHaveBeenCalled();
    expect(captureHotkey).toHaveBeenCalledOnce();
    expect(propagation).toHaveBeenCalledOnce();
    window.removeEventListener('keydown', captureHotkey);
    document.removeEventListener('keydown', propagation);
  });

  it('removes both listeners on unmount', () => {
    const goItems = vi.fn();
    const palette = vi.fn();
    const view = render(<Provider globalHandlers={{ 'go-items': goItems, palette }} />);
    view.unmount();

    key(document.body, { key: 'k', metaKey: true });
    key(document.body, { key: 'g' });
    key(document.body, { key: 'i' });
    expect(palette).not.toHaveBeenCalled();
    expect(goItems).not.toHaveBeenCalled();
  });
});
