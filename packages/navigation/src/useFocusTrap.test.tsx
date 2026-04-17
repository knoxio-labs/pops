import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFocusTrap } from './useFocusTrap';

/** Build a container with N buttons and append it to the document. */
function createContainer(buttonCount: number): HTMLDivElement {
  const container = document.createElement('div');
  for (let i = 0; i < buttonCount; i++) {
    const btn = document.createElement('button');
    btn.textContent = `Button ${i}`;
    // jsdom requires tabIndex to be explicitly set for focus() to work
    btn.tabIndex = 0;
    container.append(btn);
  }
  document.body.append(container);
  return container;
}

/** Return the button at index i, throwing if it does not exist. */
function btn(container: HTMLDivElement, i: number): HTMLButtonElement {
  const el = container.querySelectorAll<HTMLButtonElement>('button').item(i);
  if (!el) throw new Error(`No button at index ${i}`);
  return el;
}

/** Dispatch a keydown event and return the event object. */
function fireTab(shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true });
  vi.spyOn(event, 'preventDefault');
  document.dispatchEvent(event);
  return event;
}

describe('useFocusTrap', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('does not intercept Tab when inactive', () => {
    const container = createContainer(2);
    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      return useFocusTrap({ containerRef: ref, active: false });
    });

    const event = fireTab();
    // inactive trap — should not call preventDefault
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('prevents default Tab when focus is on the last focusable element', () => {
    const container = createContainer(3);

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      return useFocusTrap({ containerRef: ref, active: true });
    });

    act(() => {
      btn(container, 2).focus();
    });

    const event = fireTab(false);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('prevents default Shift+Tab when focus is on the first focusable element', () => {
    const container = createContainer(3);

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      return useFocusTrap({ containerRef: ref, active: true });
    });

    act(() => {
      btn(container, 0).focus();
    });

    const event = fireTab(true);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('wraps Tab from last element to first', () => {
    const container = createContainer(3);

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      return useFocusTrap({ containerRef: ref, active: true });
    });

    act(() => {
      btn(container, 2).focus();
    });

    act(() => {
      fireTab(false);
    });

    expect(document.activeElement).toBe(btn(container, 0));
  });

  it('wraps Shift+Tab from first element to last', () => {
    const container = createContainer(3);

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      return useFocusTrap({ containerRef: ref, active: true });
    });

    act(() => {
      btn(container, 0).focus();
    });

    act(() => {
      fireTab(true);
    });

    expect(document.activeElement).toBe(btn(container, 2));
  });

  it('does not intercept Tab when focus is on a middle element', () => {
    const container = createContainer(3);

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      return useFocusTrap({ containerRef: ref, active: true });
    });

    act(() => {
      btn(container, 1).focus();
    });

    const event = fireTab(false);
    // middle element — Tab should pass through normally
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('wraps Tab to first when focus is outside the container', () => {
    const container = createContainer(2);

    // An element outside the container
    const outside = document.createElement('button');
    outside.tabIndex = 0;
    document.body.append(outside);

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      return useFocusTrap({ containerRef: ref, active: true });
    });

    act(() => {
      outside.focus();
    });

    act(() => {
      fireTab(false);
    });

    expect(document.activeElement).toBe(btn(container, 0));
  });

  it('removes the event listener when active becomes false', () => {
    const container = createContainer(2);

    let active = true;
    const { rerender } = renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      return useFocusTrap({ containerRef: ref, active });
    });

    // Confirm trap is active first
    act(() => {
      btn(container, 1).focus();
    });
    const eventWhileActive = fireTab(false);
    expect(eventWhileActive.preventDefault).toHaveBeenCalled();

    // Deactivate
    active = false;
    rerender();

    act(() => {
      btn(container, 1).focus();
    });
    const eventWhileInactive = fireTab(false);
    expect(eventWhileInactive.preventDefault).not.toHaveBeenCalled();
  });

  it('ignores non-Tab keys', () => {
    const container = createContainer(2);

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      return useFocusTrap({ containerRef: ref, active: true });
    });

    act(() => {
      btn(container, 1).focus();
    });

    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
    vi.spyOn(event, 'preventDefault');
    document.dispatchEvent(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
