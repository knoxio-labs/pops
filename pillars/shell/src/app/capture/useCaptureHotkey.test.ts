import { afterEach, describe, expect, it } from 'vitest';

import { compileShortcut } from '../overlays/useOverlayShortcuts';
import { shouldSuppress } from './capture-hotkey-helpers';
import { matchesEvent, parseHotkey } from './useCaptureHotkey';

afterEach(() => {
  document.body.innerHTML = '';
});

function makeEvent(init: Partial<KeyboardEvent> & { target?: HTMLElement }): KeyboardEvent {
  const target = init.target ?? document.createElement('div');
  if (!target.isConnected) document.body.appendChild(target);
  const event = new KeyboardEvent('keydown', { key: 'c', cancelable: true, ...init });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

describe('shouldSuppress', () => {
  it('does not suppress on a plain key with a non-editable target', () => {
    expect(shouldSuppress(makeEvent({}))).toBe(false);
  });

  it('suppresses when the target is an INPUT', () => {
    expect(shouldSuppress(makeEvent({ target: document.createElement('input') }))).toBe(true);
  });

  it('suppresses when the target is a TEXTAREA', () => {
    expect(shouldSuppress(makeEvent({ target: document.createElement('textarea') }))).toBe(true);
  });

  it('suppresses when the target is a SELECT', () => {
    expect(shouldSuppress(makeEvent({ target: document.createElement('select') }))).toBe(true);
  });

  it('suppresses contenteditable targets', () => {
    const target = document.createElement('div');
    target.setAttribute('contenteditable', 'true');
    expect(shouldSuppress(makeEvent({ target }))).toBe(true);
  });

  it('suppresses when an ancestor opts out via data-capture-hotkey-ignore', () => {
    const wrapper = document.createElement('section');
    wrapper.setAttribute('data-capture-hotkey-ignore', '');
    const target = document.createElement('div');
    wrapper.appendChild(target);
    document.body.appendChild(wrapper);
    expect(shouldSuppress(makeEvent({ target }))).toBe(true);
  });

  it('suppresses when a modifier is held', () => {
    expect(shouldSuppress(makeEvent({ metaKey: true }))).toBe(true);
    expect(shouldSuppress(makeEvent({ ctrlKey: true }))).toBe(true);
    expect(shouldSuppress(makeEvent({ altKey: true }))).toBe(true);
  });

  it('suppresses when defaultPrevented', () => {
    const e = makeEvent({});
    e.preventDefault();
    expect(shouldSuppress(e)).toBe(true);
  });

  it('suppresses while IME composition is in progress', () => {
    const e = makeEvent({});
    Object.defineProperty(e, 'isComposing', { value: true });
    expect(shouldSuppress(e)).toBe(true);
  });
});

/**
 * `mod` satisfied by either key, which is the whole of POPS-3319.
 *
 * It used to be an alias for `meta`, so a `mod+…` chord was unreachable on
 * Linux and Windows. The failure was silent in the usual way: the listener
 * binds, no keydown ever matches, and the overlay simply never opens.
 *
 * Both keys are posed explicitly. A test that only pressed the one the author
 * had is how this survived — the chord had never been exercised on a
 * non-Apple client until POPS-3225's e2e met the Linux runner.
 */
describe('the platform-relative modifier', () => {
  const chord = parseHotkey('mod+shift+k');

  function chordEvent(
    mods: Partial<Record<'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey', boolean>>
  ) {
    return new KeyboardEvent('keydown', { key: 'k', ...mods });
  }

  it('parses mod as neither meta nor ctrl on its own', () => {
    expect(chord).toMatchObject({ key: 'k', mod: true, meta: false, ctrl: false, shift: true });
  });

  it('fires on Control and on Meta, which is what makes it reachable everywhere', () => {
    expect(matchesEvent(chord!, chordEvent({ ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(matchesEvent(chord!, chordEvent({ metaKey: true, shiftKey: true }))).toBe(true);
  });

  it('still wants one of them, and still wants the rest of the chord', () => {
    expect(matchesEvent(chord!, chordEvent({ shiftKey: true }))).toBe(false);
    expect(matchesEvent(chord!, chordEvent({ ctrlKey: true }))).toBe(false);
    expect(matchesEvent(chord!, chordEvent({ ctrlKey: true, shiftKey: true, altKey: true }))).toBe(
      false
    );
  });

  it('leaves cmd meaning Meta and ctrl meaning Control', () => {
    const cmd = parseHotkey('cmd+shift+k');
    const ctrl = parseHotkey('ctrl+shift+k');

    expect(matchesEvent(cmd!, chordEvent({ metaKey: true, shiftKey: true }))).toBe(true);
    expect(matchesEvent(cmd!, chordEvent({ ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(matchesEvent(ctrl!, chordEvent({ ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(matchesEvent(ctrl!, chordEvent({ metaKey: true, shiftKey: true }))).toBe(false);
  });

  it('resolves the same way `useOverlayShortcuts` does, which it copies', () => {
    // Cross-checked against the sibling rather than asserted twice: two
    // resolutions of one token that agree only by inspection is how they
    // drift.
    const sibling = compileShortcut('mod+shift+k');

    for (const mods of [
      { ctrlKey: true, shiftKey: true },
      { metaKey: true, shiftKey: true },
      { shiftKey: true },
    ]) {
      const event = chordEvent(mods);
      expect(matchesEvent(chord!, event), JSON.stringify(mods)).toBe(sibling(event));
    }
  });
});
