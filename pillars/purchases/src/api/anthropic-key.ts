/**
 * Resolve the Anthropic API key for the receipt drop-zone.
 *
 * Prefers the Docker-secret file (`ANTHROPIC_API_KEY_FILE`, e.g.
 * `/run/secrets/claude_api_key`) so the key arrives as a mounted file and
 * need not sit in the process environment; falls back to `ANTHROPIC_API_KEY`
 * for local dev and tests. Same arrangement as cerebrum, food-worker and
 * moltbot (ADR-039 E24), and the same one the service-account key uses — the
 * file-then-environment order itself lives in `./secret-source.ts`.
 *
 * Read fresh each call. A vision call is network-bound, so one extra syscall
 * is nothing, and staying uncached lets a test swap the source without a
 * reset seam.
 *
 * @returns the trimmed key, or `undefined` when neither source yields a
 * non-empty value — the caller then declines the upload at the edge rather
 * than accepting it and failing per-image out of sight.
 */
import { resolveSecret } from './secret-source.js';

export function resolveAnthropicApiKey(): string | undefined {
  return resolveSecret({
    fileEnvVar: 'ANTHROPIC_API_KEY_FILE',
    envVar: 'ANTHROPIC_API_KEY',
  });
}
