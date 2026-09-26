import { cn } from '../lib/utils';

import type { ReactElement } from 'react';

/** A parsed keyboard combo. `mod` is Command on macOS and Control elsewhere. */
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

/** Renders one token-backed keyboard key cap. */
export function Kbd({
  children,
  className,
}: {
  children: string;
  className?: string;
}): ReactElement {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-sans text-2xs font-medium text-muted-foreground',
        className
      )}
    >
      {children}
    </kbd>
  );
}

/** Renders every key cap in a combo or multi-step keyboard sequence. */
export function KeyCombo({
  sequence,
  className,
}: {
  sequence: readonly string[];
  className?: string;
}): ReactElement {
  const formatted = sequence.map((combo) => formatCombo(combo));
  const label = formatted.map((caps) => caps.join(' ')).join(' then ');
  const caps = formatted.flatMap((comboCaps, step) =>
    comboCaps.map((cap, position) => ({
      id: `${step}/${position}/${cap}`,
      cap,
      spaced: step > 0 && position === 0,
    }))
  );

  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={label}>
      {caps.map((entry) => (
        <Kbd key={entry.id} className={entry.spaced ? 'ml-1' : undefined}>
          {entry.cap}
        </Kbd>
      ))}
    </span>
  );
}
