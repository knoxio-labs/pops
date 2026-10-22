/**
 * Transport shared by every `PaperlessClient` call: token auth, a per-call
 * timeout, and the one error type callers branch on. A network failure is
 * `PaperlessApiError` with status `0`, so a caller can tell "Paperless is
 * unreachable" from "Paperless answered with an error".
 */
import { PaperlessApiError } from './types.js';

/** Where Paperless lives and how to authenticate to it. */
export interface PaperlessConnection {
  readonly baseUrl: string;
  readonly token: string;
}

/** `fetch` options plus the timeout the whole exchange, body included, must finish within. */
export interface PaperlessRequestInit extends RequestInit {
  readonly timeoutMs: number;
  /** Node's fetch requires it for a streamed body; the DOM `RequestInit` type does not declare it. */
  readonly duplex?: 'half';
}

/** Issue one request to Paperless; rejects with a status-0 `PaperlessApiError` on a network failure. */
export async function paperlessFetch(
  connection: PaperlessConnection,
  path: string,
  init: PaperlessRequestInit
): Promise<Response> {
  const { timeoutMs, headers, ...rest } = init;
  const merged = new Headers(headers);
  merged.set('Authorization', `Token ${connection.token}`);
  try {
    return await fetch(`${connection.baseUrl}${path}`, {
      ...rest,
      headers: merged,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new PaperlessApiError(
      0,
      `Network error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** Return `response` when it is 2xx, otherwise throw a `PaperlessApiError` carrying Paperless's `detail`. */
export async function ensureOk(response: Response): Promise<Response> {
  if (response.ok) return response;
  let message = `Paperless API error: ${response.status} ${response.statusText}`;
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'detail' in body) {
      const { detail } = body;
      if (typeof detail === 'string' && detail !== '') message = detail;
    }
  } catch {
    // A non-JSON error body leaves the status line as the message.
  }
  throw new PaperlessApiError(response.status, message);
}
