/**
 * The code field's model (ADR-002 D7): a code is optional and unique
 * case-insensitively; the server suggests one on request and never assigns
 * one. A taken code blocks Save and offers the next free code that keeps the
 * stem, the same answer the collision repair gives (B412 to B413).
 */

/** Who holds a code already. */
export interface CodeHolder {
  id: string;
  name: string;
}

/** Every code in use, keyed by its lowercase form. */
export type TakenCodes = ReadonlyMap<string, CodeHolder>;

/** Where the suggestion stands. `offline` and `unavailable` cannot suggest; typing still works. */
export type CodeAssist =
  | { kind: 'idle' }
  | { kind: 'suggesting' }
  | { kind: 'offered'; suggestion: string }
  | { kind: 'offline' }
  | { kind: 'unavailable' };

/** What the uniqueness check said about the typed value. */
export type CodeCheck =
  | { kind: 'none' }
  | { kind: 'checking' }
  | { kind: 'free' }
  | { kind: 'taken'; holder: CodeHolder; freeCode: string };

/** The code field's whole state. */
export interface CodeEntry {
  value: string;
  assist: CodeAssist;
  check: CodeCheck;
  /** The code the item already has, when editing; keeping it is never a collision. */
  own: string | null;
}

/** Things that happen to the code field. */
export type CodeAction =
  | { type: 'suggest' }
  | { type: 'suggested'; suggestion: string }
  | { type: 'suggest-failed'; reason: 'offline' | 'unavailable' }
  | { type: 'accept' }
  | { type: 'dismiss' }
  | { type: 'typed'; value: string }
  | { type: 'check-started' }
  | { type: 'checked'; taken: TakenCodes };

/** An empty code field. */
export function codeEntry(own: string | null = null): CodeEntry {
  return { value: own ?? '', assist: { kind: 'idle' }, check: { kind: 'none' }, own };
}

const NUMBERED = /^(.*?)(\d+)$/u;

/**
 * The next code after `seed` that nobody holds, keeping its stem and the
 * width of its number: `B412` gives `B413`, `P01` gives `P02`, and a code
 * with no number gains one (`TV` gives `TV2`).
 */
export function nextFreeCode(seed: string, taken: TakenCodes): string {
  const match = NUMBERED.exec(seed);
  const stem = match ? (match[1] ?? '') : seed;
  const digits = match ? (match[2] ?? '') : '';
  let number = digits === '' ? 1 : Number(digits);
  for (;;) {
    number += 1;
    const candidate = `${stem}${String(number).padStart(digits.length, '0')}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** Who else holds `value`, ignoring case and ignoring the item's own code. */
export function holderOf(value: string, taken: TakenCodes, own: string | null): CodeHolder | null {
  const key = value.trim().toLowerCase();
  if (key === '' || (own !== null && own.toLowerCase() === key)) return null;
  return taken.get(key) ?? null;
}

function checked(entry: CodeEntry, taken: TakenCodes): CodeCheck {
  if (entry.value.trim() === '') return { kind: 'none' };
  const holder = holderOf(entry.value, taken, entry.own);
  if (holder === null) return { kind: 'free' };
  return { kind: 'taken', holder, freeCode: nextFreeCode(entry.value.trim(), taken) };
}

function accepted(entry: CodeEntry): CodeEntry {
  if (entry.assist.kind !== 'offered') return entry;
  return {
    ...entry,
    value: entry.assist.suggestion,
    assist: { kind: 'idle' },
    check: { kind: 'free' },
  };
}

/** The code field's reducer. */
export function codeReducer(entry: CodeEntry, action: CodeAction): CodeEntry {
  switch (action.type) {
    case 'suggest':
      return { ...entry, assist: { kind: 'suggesting' } };
    case 'suggested':
      return { ...entry, assist: { kind: 'offered', suggestion: action.suggestion } };
    case 'suggest-failed':
      return { ...entry, assist: { kind: action.reason } };
    case 'accept':
      return accepted(entry);
    case 'dismiss':
      return { ...entry, assist: { kind: 'idle' } };
    case 'typed':
      return { ...entry, value: action.value, assist: { kind: 'idle' }, check: { kind: 'none' } };
    case 'check-started':
      return entry.value.trim() === '' ? entry : { ...entry, check: { kind: 'checking' } };
    case 'checked':
      return { ...entry, check: checked(entry, action.taken) };
  }
}

/** Why the code stops Save, or null. Empty is fine: a code is optional. */
export function codeBlocksSave(entry: CodeEntry): string | null {
  if (entry.check.kind === 'taken') {
    return `${entry.value.trim()} is already on ${entry.check.holder.name}.`;
  }
  return entry.check.kind === 'checking' ? 'Still checking the code.' : null;
}
