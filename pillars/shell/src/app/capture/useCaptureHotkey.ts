/**
 * useCaptureHotkey — keyboard shortcut that opens the global capture
 * modal.
 *
 * Accepts both single-key shortcuts (`'c'`) and the wire-format chord
 * shape declared on `frontend.captureOverlay.hotkey` (e.g.
 * `'mod+shift+k'`). When a chord with modifiers is supplied the modifier
 * suppression in `capture-hotkey-helpers.ts` is bypassed for the chord
 * itself — focus-inside-input suppression still applies for both shapes.
 *
 * Registered on `window` keydown. Empty string disables the listener.
 */
import { useEffect } from 'react';

import { shouldSuppress } from './capture-hotkey-helpers';

interface UseCaptureHotkeyArgs {
  /** Hotkey wire string (single key or `mod+mod+key` chord). Empty disables. */
  key: string;
  /** Whether the modal is already open — suppresses re-fires. */
  enabled: boolean;
  /** Open-modal callback. */
  onTrigger: () => void;
}

interface ParsedHotkey {
  readonly key: string;
  readonly meta: boolean;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  /**
   * The platform-relative modifier: Meta on Apple, Control everywhere else.
   *
   * Kept apart from `meta` rather than folded into it at parse time, because
   * which key it means is a fact about the client and not about the string.
   * `mod` used to be an alias for `meta`, which made every `mod+…` chord
   * unreachable on Linux and Windows — silently, since the listener binds
   * fine and simply never matches (POPS-3319).
   */
  readonly mod: boolean;
}

type ModifierKind = 'meta' | 'ctrl' | 'shift' | 'alt' | 'mod';

/**
 * `mod` is the conventional platform-relative token — CodeMirror, Mousetrap
 * and ProseMirror all use it this way. `cmd` and `super` stay strictly Meta
 * and `ctrl` strictly Control, so a manifest that genuinely means one
 * physical key can still say so.
 */
const MODIFIER_ALIASES: Readonly<Record<string, ModifierKind>> = {
  cmd: 'meta',
  meta: 'meta',
  mod: 'mod',
  super: 'meta',
  ctrl: 'ctrl',
  control: 'ctrl',
  shift: 'shift',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
};

/**
 * Whether this client is an Apple one, for resolving `mod`.
 *
 * Reads `navigator.platform` first. It is deprecated and it is also the only
 * thing every browser still reports honestly for this question; the
 * user-agent string is the fallback for an engine that has removed it. Both
 * are wrong for a reader who has spoofed them, which costs that reader a
 * hotkey and nothing else.
 *
 * @param nav Injected by tests, which need to pose both platforms.
 */
export function isApplePlatform(
  nav: Pick<Navigator, 'platform' | 'userAgent'> = navigator
): boolean {
  return /mac|iphone|ipad|ipod/iu.test(nav.platform || nav.userAgent);
}

function splitHotkey(raw: string): readonly string[] {
  return raw
    .trim()
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Parse a wire-format hotkey string into the modifier flags + key.
 *
 * `cmd` and `super` mean Meta, `ctrl` means Control, and `mod` means whichever
 * of the two the client uses — resolved at match time, not here. The `key`
 * segment is matched against `KeyboardEvent.key`, and multi-char chord
 * segments are lower-cased so `'Mod+Shift+K'` and `'mod+shift+k'` are
 * equivalent.
 *
 * Returns `null` for empty input.
 */
export function parseHotkey(raw: string): ParsedHotkey | null {
  const parts = splitHotkey(raw);
  if (parts.length === 0) return null;
  const flags: Record<ModifierKind, boolean> = {
    meta: false,
    ctrl: false,
    shift: false,
    alt: false,
    mod: false,
  };
  let keyPart: string | null = null;
  for (const part of parts) {
    const modifier = MODIFIER_ALIASES[part];
    if (modifier !== undefined) {
      flags[modifier] = true;
      continue;
    }
    keyPart = part;
  }
  if (keyPart === null) return null;
  return { key: keyPart, ...flags };
}

/**
 * The modifiers a chord requires on this client, with `mod` resolved.
 *
 * Exported for the two-platform tests: the whole defect was a resolution that
 * only ever produced one answer, so the assertion has to be able to pose both.
 */
export function requiredModifiers(
  parsed: ParsedHotkey,
  apple: boolean
): { meta: boolean; ctrl: boolean; shift: boolean; alt: boolean } {
  return {
    meta: parsed.meta || (parsed.mod && apple),
    ctrl: parsed.ctrl || (parsed.mod && !apple),
    shift: parsed.shift,
    alt: parsed.alt,
  };
}

export function matchesEvent(parsed: ParsedHotkey, e: KeyboardEvent, apple: boolean): boolean {
  if (e.key.toLowerCase() !== parsed.key) return false;
  const required = requiredModifiers(parsed, apple);
  if (e.metaKey !== required.meta) return false;
  if (e.ctrlKey !== required.ctrl) return false;
  if (e.shiftKey !== required.shift) return false;
  if (e.altKey !== required.alt) return false;
  return true;
}

function hasModifier(p: ParsedHotkey): boolean {
  return p.meta || p.ctrl || p.alt || p.mod;
}

export function useCaptureHotkey({ key, enabled, onTrigger }: UseCaptureHotkeyArgs): void {
  useEffect(() => {
    const parsed = parseHotkey(key);
    if (parsed === null || !enabled) return undefined;
    const apple = isApplePlatform();
    const handler = (e: KeyboardEvent) => {
      if (!matchesEvent(parsed, e, apple)) return;
      if (e.defaultPrevented) return;
      if (e.isComposing) return;
      // Chords with a non-shift modifier fire even when focus is inside
      // an editable surface — that is the whole point of `mod+shift+k`.
      // Plain single-key shortcuts keep the input-focus suppression.
      if (!hasModifier(parsed) && shouldSuppress(e)) return;
      e.preventDefault();
      onTrigger();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, enabled, onTrigger]);
}
