/**
 * The shortcut registry's behaviour: parse a combo, format it as key caps,
 * match a keyboard event, follow two-key sequences (`g i`), resolve what is
 * live in a scope, and find conflicts before a person does.
 */
import { SHORTCUTS } from './shortcut-bindings';

import type { ShortcutBinding, ShortcutScope } from './shortcut-bindings';

export { SCOPE_TITLES, SHORTCUTS } from './shortcut-bindings';
export type { ShortcutBinding, ShortcutScope } from './shortcut-bindings';
export { formatCombo, matchesCombo, parseCombo } from './shortcut-keys';
export type { Combo, KeyInput } from './shortcut-keys';
export { createSequenceMatcher } from './shortcut-sequence';
export type { SequenceMatcher } from './shortcut-sequence';

/** The bindings live in a scope: its own, then every global one it does not claim or shadow. */
export function bindingsFor(scope: ShortcutScope, registry = SHORTCUTS): ShortcutBinding[] {
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

/**
 * Every clash: two bindings on the same keys, or one binding's single key
 * swallowing another's sequence prefix (`g` against `g i`). A scoped binding
 * clashing with a global one counts unless it names it in `shadows`.
 */
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
    own.forEach((a, index) => {
      for (const other of live.slice(index + 1)) {
        if (other.id === a.id || a.shadows === other.id || !firstKeyClashes(a, other)) continue;
        conflicts.push({ scope, keys: a.sequence.join(' '), ids: [a.id, other.id] });
      }
    });
  }
  return conflicts;
}

/** A binding by id; throws on a typo so a hint can never silently vanish. */
export function shortcut(id: string, registry = SHORTCUTS): ShortcutBinding {
  const found = registry.find((binding) => binding.id === id);
  if (found === undefined) throw new Error(`No inventory shortcut ${id}`);
  return found;
}

/** Whether keystrokes belong to a text field, where only Mod combos and Esc may act. */
export function isTypingTarget(
  target: { tagName?: string; isContentEditable?: boolean } | null
): boolean {
  if (target === null) return false;
  if (target.isContentEditable === true) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes((target.tagName ?? '').toUpperCase());
}
