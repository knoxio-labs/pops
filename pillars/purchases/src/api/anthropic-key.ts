/**
 * Resolve the Anthropic API key for the receipt drop-zone.
 *
 * Prefers the Docker-secret file (`ANTHROPIC_API_KEY_FILE`, e.g.
 * `/run/secrets/claude_api_key`) so the key arrives as a mounted file and
 * need not sit in the process environment; falls back to `ANTHROPIC_API_KEY`
 * for local dev and tests. Same arrangement as cerebrum, food-worker and
 * moltbot (ADR-039 E24).
 *
 * Read fresh each call. A vision call is network-bound, so one extra syscall
 * is nothing, and staying uncached lets a test swap the source without a
 * reset seam.
 *
 * @returns the trimmed key, or `undefined` when neither source yields a
 * non-empty value — the caller then declines the upload at the edge rather
 * than accepting it and failing per-image out of sight.
 */
import { readFileSync } from 'node:fs';

export function resolveAnthropicApiKey(): string | undefined {
  const filePath = process.env['ANTHROPIC_API_KEY_FILE'];
  if (filePath !== undefined && filePath !== '') {
    try {
      const fromFile = readFileSync(filePath, 'utf-8').trim();
      if (fromFile !== '') return fromFile;
    } catch (error) {
      console.warn(
        `[purchases] could not read ANTHROPIC_API_KEY_FILE (${filePath}): ` +
          `${error instanceof Error ? error.message : String(error)} — ` +
          'falling back to ANTHROPIC_API_KEY'
      );
    }
  }
  const fromEnv = process.env['ANTHROPIC_API_KEY']?.trim();
  return fromEnv === undefined || fromEnv === '' ? undefined : fromEnv;
}
