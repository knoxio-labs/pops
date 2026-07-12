/**
 * Resolve the Anthropic API key for cerebrum's LLM ports.
 *
 * Prefers the Docker-secret file (`ANTHROPIC_API_KEY_FILE`, e.g.
 * `/run/secrets/claude_api_key`) so the key is delivered as a mounted file and
 * need not sit in the process environment; falls back to the plain
 * `ANTHROPIC_API_KEY` env var for local dev and tests. This unifies cerebrum
 * with the food-worker / moltbot consumers, which already read the key from a
 * Docker secret file (ADR-039 E24).
 *
 * Read fresh on every call — LLM calls are network-bound, so the extra syscall
 * when the file source is configured is negligible, and staying uncached lets a
 * test swap the source between calls without a reset seam.
 *
 * @returns the trimmed key, or `undefined` when neither source yields a
 * non-empty value — callers degrade to a fallback rather than throwing.
 */
import { readFileSync } from 'node:fs';

export function resolveAnthropicApiKey(): string | undefined {
  const filePath = process.env['ANTHROPIC_API_KEY_FILE'];
  if (filePath !== undefined && filePath !== '') {
    try {
      const fromFile = readFileSync(filePath, 'utf-8').trim();
      if (fromFile !== '') return fromFile;
    } catch (err) {
      console.warn(
        `[cerebrum] failed to read ANTHROPIC_API_KEY_FILE (${filePath}): ${
          err instanceof Error ? err.message : String(err)
        } — falling back to ANTHROPIC_API_KEY`
      );
    }
  }

  const fromEnv = process.env['ANTHROPIC_API_KEY'];
  return fromEnv !== undefined && fromEnv !== '' ? fromEnv : undefined;
}
