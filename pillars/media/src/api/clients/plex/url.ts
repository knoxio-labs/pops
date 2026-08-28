/**
 * Plex base-URL normalization.
 *
 * Shared by the write path (`setPlexUrl`) and the read path (`getPlexUrl`),
 * because a `plex_url` row can also be written by the generic settings panel,
 * the `PLEX_URL` env fallback, or a direct DB write — none of which go through
 * `setPlexUrl`. A schemeless value such as `192.168.1.2:32400` makes every
 * `fetch` throw, so normalization has to happen where the value is read.
 */

/**
 * Normalize a Plex base URL, prepending `http://` when no scheme is present.
 *
 * Returns `null` when the input is blank or cannot be parsed as a URL.
 */
export function normalizePlexUrl(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const withScheme =
    trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `http://${trimmed}`;
  try {
    new URL(withScheme);
  } catch {
    return null;
  }
  return withScheme;
}
