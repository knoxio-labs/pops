import { toast } from 'sonner';

import { MediaApiError, isNotFoundError, isUnavailableError } from '../../media-api-helpers.js';

/**
 * Report a failed discover action, naming the failure class in the toast.
 *
 * Every discover handler used to swallow the error and render one flat
 * "Failed to X", so a 500 and a 404 were indistinguishable from the UI and
 * only server logs could tell them apart.
 *
 * The raw error also reaches the console, so a browser-side report is enough
 * to triage without shell access to the host.
 *
 * `action` is the verb phrase, e.g. `add to library`.
 */
export function toastActionError(action: string, err: unknown): void {
  console.error(`discover action failed: ${action}`, err);
  toast.error(`Failed to ${action}: ${describeActionError(err)}`);
}

function describeActionError(err: unknown): string {
  if (isUnavailableError(err)) return 'the media service is unavailable';
  if (isNotFoundError(err)) return 'not found on the server';
  if (err instanceof MediaApiError) return `${err.message} (HTTP ${String(err.status)})`;
  if (err instanceof Error) return err.message;
  return String(err);
}
