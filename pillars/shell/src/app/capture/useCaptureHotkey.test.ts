import { afterEach, describe, expect, it } from 'vitest';

import { shouldSuppress } from './capture-hotkey-helpers';
import { isApplePlatform, matchesEvent, parseHotkey, requiredModifiers } from './useCaptureHotkey';

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
 * `mod` resolved against the client, which is the whole of POPS-3319.
 *
 * It used to be an alias for `meta`, so a `mod+…` chord was unreachable on
 * Linux and Windows. The failure was silent in the usual way: the listener
 * binds, no keydown ever matches, and the overlay simply never opens.
 *
 * Both platforms are posed explicitly. A test that only ran on the machine it
 * was written on is how this survived — the chord had never been exercised on
 * a non-Apple client until POPS-3225's e2e met the Linux runner.
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

  it('wants Meta on an Apple client and Control on any other', () => {
    expect(requiredModifiers(chord!, true)).toMatchObject({ meta: true, ctrl: false });
    expect(requiredModifiers(chord!, false)).toMatchObject({ meta: false, ctrl: true });
  });

  it('fires on Control off Apple, and refuses Meta there', () => {
    expect(matchesEvent(chord!, chordEvent({ ctrlKey: true, shiftKey: true }), false)).toBe(true);
    expect(matchesEvent(chord!, chordEvent({ metaKey: true, shiftKey: true }), false)).toBe(false);
  });

  it('fires on Meta on Apple, and refuses Control there', () => {
    expect(matchesEvent(chord!, chordEvent({ metaKey: true, shiftKey: true }), true)).toBe(true);
    expect(matchesEvent(chord!, chordEvent({ ctrlKey: true, shiftKey: true }), true)).toBe(false);
  });

  it('leaves cmd meaning Meta and ctrl meaning Control on every platform', () => {
    const cmd = parseHotkey('cmd+shift+k');
    const ctrl = parseHotkey('ctrl+shift+k');

    for (const apple of [true, false]) {
      expect(matchesEvent(cmd!, chordEvent({ metaKey: true, shiftKey: true }), apple)).toBe(true);
      expect(matchesEvent(cmd!, chordEvent({ ctrlKey: true, shiftKey: true }), apple)).toBe(false);
      expect(matchesEvent(ctrl!, chordEvent({ ctrlKey: true, shiftKey: true }), apple)).toBe(true);
      expect(matchesEvent(ctrl!, chordEvent({ metaKey: true, shiftKey: true }), apple)).toBe(false);
    }
  });
});

describe('isApplePlatform', () => {
  it('reads a Mac from either the platform or the user agent', () => {
    expect(isApplePlatform({ platform: 'MacIntel', userAgent: '' })).toBe(true);
    expect(isApplePlatform({ platform: '', userAgent: 'Mozilla/5.0 (Macintosh; …)' })).toBe(true);
    expect(isApplePlatform({ platform: 'iPhone', userAgent: '' })).toBe(true);
  });

  it('reads everything else as not Apple', () => {
    expect(isApplePlatform({ platform: 'Linux x86_64', userAgent: 'X11; Linux' })).toBe(false);
    expect(isApplePlatform({ platform: 'Win32', userAgent: 'Windows NT 10.0' })).toBe(false);
  });
});
