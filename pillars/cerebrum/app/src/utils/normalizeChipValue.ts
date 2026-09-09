/**
 * Normalises a raw tag or scope input before it becomes a chip: trim,
 * lowercase, and collapse whitespace runs into a single hyphen. Shared by
 * every `ChipInput` with suggestions in Cerebrum's ingest form so tags and
 * scopes end up in the same slug-like shape.
 */
export function normalizeChipValue(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-');
}
