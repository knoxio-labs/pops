/**
 * Two-key sequences (`g i`) as a small state machine: the first key arms
 * it, the second fires within a second or the sequence lapses. A single
 * combo fires immediately.
 */
import { matchesCombo } from './shortcut-keys';

import type { ShortcutBinding } from './shortcut-bindings';
import type { KeyInput } from './shortcut-keys';

/** What {@link createSequenceMatcher} returns. */
export interface SequenceMatcher {
  /** Feeds one key; returns the binding it completes, or null. */
  feed: (input: KeyInput, now: number) => ShortcutBinding | null;
  /** The armed first key, for a "g…" hint, or null. */
  pending: () => string | null;
}

/** A matcher over `bindings`; a half-typed sequence lapses after `timeoutMs`. */
export function createSequenceMatcher(
  bindings: readonly ShortcutBinding[],
  timeoutMs = 1000
): SequenceMatcher {
  let armed: { first: string; at: number } | null = null;

  const complete = (input: KeyInput): ShortcutBinding | null =>
    bindings.find(
      (binding) =>
        binding.sequence.length === 2 &&
        binding.sequence[0] === armed?.first &&
        matchesCombo(input, binding.sequence[1] ?? '')
    ) ?? null;

  return {
    feed(input, now) {
      if (armed !== null && now - armed.at <= timeoutMs) {
        const done = complete(input);
        armed = null;
        if (done !== null) return done;
      }
      armed = null;
      const single = bindings.find(
        (binding) => binding.sequence.length === 1 && matchesCombo(input, binding.sequence[0] ?? '')
      );
      if (single !== undefined) return single;
      const starts = bindings.find(
        (binding) => binding.sequence.length === 2 && matchesCombo(input, binding.sequence[0] ?? '')
      );
      if (starts !== undefined) armed = { first: starts.sequence[0] ?? '', at: now };
      return null;
    },
    pending: () => armed?.first ?? null,
  };
}
