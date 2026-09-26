/**
 * Key combos as the shortcut registry spells them (`Mod+Shift+Enter`):
 * parsing, rendering as key caps, and matching a keyboard event.
 */
/** A parsed combo. `mod` is Cmd on a Mac and Ctrl elsewhere. */
export interface Combo {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

/** The fields of a keyboard event a combo is matched against. */
export interface KeyInput {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/** Parses `Mod+Shift+Enter` into its parts. Key names are case-insensitive. */
export function parseCombo(combo: string): Combo {
  const parts = combo.split('+');
  const key = (parts.at(-1) ?? '').toLowerCase();
  const modifiers = new Set(parts.slice(0, -1).map((part) => part.toLowerCase()));
  return {
    key,
    mod: modifiers.has('mod'),
    shift: modifiers.has('shift'),
    alt: modifiers.has('alt'),
  };
}

const KEY_CAPS: Readonly<Record<string, string>> = {
  enter: 'Enter',
  escape: 'Esc',
  backspace: 'Backspace',
  tab: 'Tab',
  space: 'Space',
  arrowdown: '↓',
  arrowup: '↑',
};

/** The key caps a combo renders as, e.g. `['⌘', 'K']` on a Mac or `['Ctrl', 'K']` elsewhere. */
export function formatCombo(combo: string, platform: 'mac' | 'other' = 'mac'): string[] {
  const parsed = parseCombo(combo);
  const caps: string[] = [];
  if (parsed.mod) caps.push(platform === 'mac' ? '⌘' : 'Ctrl');
  if (parsed.alt) caps.push(platform === 'mac' ? '⌥' : 'Alt');
  if (parsed.shift) caps.push(platform === 'mac' ? '⇧' : 'Shift');
  caps.push(KEY_CAPS[parsed.key] ?? parsed.key.toUpperCase());
  return caps;
}

function eventKey(input: KeyInput): string {
  return input.key === ' ' ? 'space' : input.key.toLowerCase();
}

/**
 * Whether an event is this combo. Shift is compared only when the combo
 * names it or the key is a letter, because `?` and `/` differ by layout in
 * whether they need Shift at all.
 */
export function matchesCombo(input: KeyInput, combo: string): boolean {
  const parsed = parseCombo(combo);
  if (eventKey(input) !== parsed.key) return false;
  const mod = input.metaKey === true || input.ctrlKey === true;
  if (mod !== parsed.mod || (input.altKey === true) !== parsed.alt) return false;
  const letter = /^[a-z]$/u.test(parsed.key);
  return !(parsed.shift || letter) || (input.shiftKey === true) === parsed.shift;
}
