/**
 * Parses shortcut registry combos, formats them as platform-specific key caps,
 * and matches them against keyboard-event-like input.
 */

/** A parsed combo. `mod` is Command on macOS and Control elsewhere. */
export interface Combo {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

/** The keyboard-event fields used when matching a combo. */
export interface KeyInput {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/** Parses a case-insensitive, `+`-joined keyboard combo into its key and modifiers. */
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

/** Formats a combo as ordered key caps for macOS or other platforms. */
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
 * Reports whether an input matches a combo. Shift is exact for letters and explicit Shift combos,
 * while punctuation remains independent of keyboard-layout Shift requirements.
 */
export function matchesCombo(input: KeyInput, combo: string): boolean {
  const parsed = parseCombo(combo);
  if (eventKey(input) !== parsed.key) return false;

  const mod = input.metaKey === true || input.ctrlKey === true;
  if (mod !== parsed.mod || (input.altKey === true) !== parsed.alt) return false;

  const letter = /^[a-z]$/u.test(parsed.key);
  return !(parsed.shift || letter) || (input.shiftKey === true) === parsed.shift;
}
