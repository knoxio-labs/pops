/**
 * The two things a kit input needs from the DOM element behind it: a handle
 * on it, and a way to raise a change it was not typed.
 *
 * Both were written twice before this file existed — `TextInput`'s clear
 * button and `NumberInput`'s steppers reach for the same mechanism for the
 * same reason, and the second copy is what let `NumberInput` fake a change
 * event instead (POPS-3296).
 */
import type { Ref, RefObject } from 'react';

/**
 * Merge a component's own ref with the one its caller forwarded, so both see
 * the element and neither displaces the other.
 *
 * Returns a callback ref; memoise it on the forwarded ref, or React detaches
 * and reattaches the element on every render.
 */
export function mergeRefs<T>(
  local: RefObject<T | null>,
  forwarded: Ref<T>
): (el: T | null) => void {
  return (el) => {
    local.current = el;
    if (typeof forwarded === 'function') forwarded(el);
    else if (forwarded) forwarded.current = el;
  };
}

/**
 * Set an input's value and raise the change, as though a person had made it.
 *
 * For anything that is not a keystroke — a clear button, a stepper, a drag
 * gesture — there is no DOM event to forward, and an object standing in for
 * one is a lie: it carries whichever fields its author thought of, so a
 * consumer reading `e.currentTarget.value`, which React's own types
 * encourage, reads `undefined.value` and throws. Making the change real is
 * the only way to get a real event out of React.
 *
 * The write goes through `HTMLInputElement.prototype`'s own setter rather
 * than through `el.value`. React tracks a controlled input's last value on
 * the element itself, by overriding that property, and compares on every
 * `input` event; assigning `el.value` would update the tracker too, and the
 * event React then built would look like a no-op change. Going through the
 * prototype setter leaves the tracker holding the old value, so the
 * comparison sees a difference and React dispatches a genuine synthetic
 * event at the genuine element.
 *
 * Throws rather than no-opping when the setter is absent: an environment
 * without it would otherwise dispatch an event announcing a change that
 * never happened, which is the silent-pass shape ADR-045 exists to refuse.
 */
export function setInputValueAndNotify(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter === undefined) {
    throw new Error('setInputValueAndNotify: HTMLInputElement.prototype exposes no value setter.');
  }
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
