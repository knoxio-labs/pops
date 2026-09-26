/**
 * Registry queries shared by the provider, visible hints and the shortcut
 * sheet. The same queries also make conflicts and missing ids fail early.
 */
import { SHORTCUTS } from './shortcut-bindings';

import type { ShortcutBinding, ShortcutScope } from './shortcut-bindings';

export { SCOPE_TITLES, SHORTCUTS } from './shortcut-bindings';
export type { ShortcutBinding, ShortcutScope } from './shortcut-bindings';
export { formatCombo, matchesCombo, parseCombo } from '@pops/ui';
export type { Combo, KeyInput } from '@pops/ui';
export { createSequenceMatcher } from './shortcut-sequence';
export type { SequenceMatcher } from './shortcut-sequence';

/** Binding ids that remain active while focus is in a text field. */
export const TYPING_TARGET_BINDINGS = [
  'form-save',
  'form-save-new',
  'form-cancel',
  'dismiss',
] as const;

/** The bindings live in a scope: its own, then eligible global bindings. */
export function bindingsFor(
  scope: ShortcutScope,
  registry: readonly ShortcutBinding[] = SHORTCUTS
): ShortcutBinding[] {
  const own = registry.filter((binding) => binding.scope === scope);
  if (scope === 'global' || scope === 'palette') return own;

  const claimed = new Set(own.map((binding) => binding.sequence.join(' ').toLowerCase()));
  const shadowed = new Set(own.flatMap((binding) => (binding.shadows ? [binding.shadows] : [])));
  const globals = registry.filter(
    (binding) =>
      binding.scope === 'global' &&
      !shadowed.has(binding.id) &&
      !claimed.has(binding.sequence.join(' ').toLowerCase())
  );
  return [...own, ...globals];
}

/** A pair of bindings that would fire on the same keys in the same place. */
export interface ShortcutConflict {
  scope: ShortcutScope;
  keys: string;
  ids: [string, string];
}

function firstKeyClashes(a: ShortcutBinding, b: ShortcutBinding): boolean {
  const same = a.sequence.join(' ').toLowerCase() === b.sequence.join(' ').toLowerCase();
  const prefix =
    a.sequence.length !== b.sequence.length &&
    a.sequence[0]?.toLowerCase() === b.sequence[0]?.toLowerCase();
  return same || prefix;
}

/** Finds same-key and sequence-prefix conflicts in every live scope. */
export function findConflicts(
  registry: readonly ShortcutBinding[] = SHORTCUTS
): ShortcutConflict[] {
  const scopes: readonly ShortcutScope[] = ['global', 'list', 'detail', 'form', 'palette'];
  const conflicts: ShortcutConflict[] = [];

  for (const scope of scopes) {
    const own = registry.filter((binding) => binding.scope === scope);
    const globals =
      scope === 'global' || scope === 'palette' ? [] : registry.filter((x) => x.scope === 'global');
    const live = [...own, ...globals];

    own.forEach((binding, index) => {
      for (const other of live.slice(index + 1)) {
        if (
          other.id === binding.id ||
          binding.shadows === other.id ||
          !firstKeyClashes(binding, other)
        ) {
          continue;
        }
        conflicts.push({ scope, keys: binding.sequence.join(' '), ids: [binding.id, other.id] });
      }
    });
  }

  return conflicts;
}

/** Looks up a binding and throws on a typo so a visible hint cannot vanish silently. */
export function shortcut(
  id: string,
  registry: readonly ShortcutBinding[] = SHORTCUTS
): ShortcutBinding {
  const found = registry.find((binding) => binding.id === id);
  if (found === undefined) throw new Error(`No inventory shortcut ${id}`);
  return found;
}

/** Reports whether an event target is an input-like or contenteditable target. */
export function isTypingTarget(
  target: { tagName?: string; isContentEditable?: boolean } | null
): boolean {
  if (target === null) return false;
  if (target.isContentEditable === true) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes((target.tagName ?? '').toUpperCase());
}
