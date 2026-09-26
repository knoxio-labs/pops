/**
 * Matches the two-key sequences in the shortcut registry. A half-typed
 * sequence expires after a short window and never prevents the first key.
 */
import { matchesCombo } from '@pops/ui';

import type { KeyInput } from '@pops/ui';

import type { ShortcutBinding } from './shortcut-bindings';

/** The stateful matcher used by the shortcut provider. */
export interface SequenceMatcher {
  /** Feeds one key and returns the binding it completes, or null. */
  feed: (input: KeyInput, now: number) => ShortcutBinding | null;
  /** Returns the first combo currently waiting for its second key, or null. */
  pending: () => string | null;
}

/** Creates a matcher for bindings with a timeout in milliseconds for sequences. */
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
