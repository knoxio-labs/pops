import type { FieldKind } from './FieldFormContext';

/**
 * Owner-facing value-rule copy for each primitive kind, shown under the kind
 * picker so the constraint a value must satisfy is visible before it is hit
 * as a refusal. Mirrors the canonical limits enforced server-side in
 * `@pops/inventory`'s value codec (short/long text length, decimal precision
 * and scale, the safe integer range, and the URL/date/date-time formats).
 * `measurement` and `reference` get their own contextual hints elsewhere
 * (the unit's dimension readout, and the reference-target note), and
 * `boolean`/`enum` need no value-rule hint beyond their picker.
 */
const FIELD_KIND_HINTS: Partial<Record<FieldKind, string>> = {
  short_text: 'Up to 200 characters.',
  long_text: 'Up to 20,000 characters. Line breaks are kept.',
  integer: 'A whole number within the safe integer range.',
  decimal: 'Up to 18 significant digits, up to 9 decimal places.',
  date: 'A calendar date, with no time component.',
  date_time: 'A UTC timestamp with millisecond precision.',
  url: 'Must be a secure (HTTPS) URL.',
};

/** The value-rule hint for a primitive kind, or null when it has none of its own. */
export function fieldKindHint(kind: FieldKind): string | null {
  return FIELD_KIND_HINTS[kind] ?? null;
}
