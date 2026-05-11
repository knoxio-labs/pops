/**
 * Shared error rendering for CLI commands. Maps the API error hierarchy to
 * exit codes so every command behaves the same:
 *
 *   - 3 → API unreachable (network failure, server down, wrong URL)
 *   - 1 → API responded with a typed tRPC error (validation, auth, etc.)
 *   - 1 → anything else (unexpected throw)
 */
import { ApiError, ApiUnreachableError } from './api-client.js';

export function writeApiError(stderr: NodeJS.WritableStream, err: unknown): number {
  if (err instanceof ApiUnreachableError) {
    stderr.write(`error: ${err.message}\n`);
    return 3;
  }
  if (err instanceof ApiError) {
    stderr.write(`error: ${err.message}\n`);
    return 1;
  }
  stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
  return 1;
}
