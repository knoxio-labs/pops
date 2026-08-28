/**
 * Plex HTTP fetch helpers (no business logic).
 *
 * Every Plex host — the Media Server, plex.tv and the Discover cloud —
 * accepts `X-Plex-Token` as a request header, and that is the only way this
 * module sends it. A token in the query string is recorded by every
 * intermediary access log, and `fetch` echoes the offending URL back inside
 * its own `TypeError`, which then travels verbatim into a `PlexApiError` and
 * out to REST clients. `redactPlexToken` is the second line of defence, for
 * messages built from upstream response bodies we do not control.
 *
 *  - `getAbsolute`  — GET an absolute Plex URL
 *  - `getPath`      — GET a path against a Plex Media Server base URL
 *  - `postAbsolute` — POST a JSON body to an absolute Plex URL
 *  - `putAbsolute`  — PUT an absolute Plex URL
 */
import { PlexApiError } from './types.js';

/** Credentials for a Plex request; sent as `X-Plex-*` headers, never in the URL. */
export interface PlexAuth {
  token: string;
  clientId?: string;
}

export interface PlexRequestOptions {
  auth?: PlexAuth;
  /** Prefix for generated error messages, e.g. `'Plex friends API'`. */
  context?: string;
}

const DEFAULT_CONTEXT = 'Plex API';
const TOKEN_IN_QUERY = /X-Plex-Token=[^&\s"'<>]*/gi;

/**
 * Strip any `X-Plex-Token=…` value out of text bound for an error or a log.
 *
 * Exported so callers building their own messages from upstream text can
 * apply the same guarantee.
 */
export function redactPlexToken(text: string): string {
  return text.replace(TOKEN_IN_QUERY, 'X-Plex-Token=[redacted]');
}

function buildHeaders(auth: PlexAuth | undefined): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (auth === undefined) return headers;
  headers['X-Plex-Token'] = auth.token;
  if (auth.clientId !== undefined) headers['X-Plex-Client-Identifier'] = auth.clientId;
  return headers;
}

async function readErrorMessage(response: Response, context: string): Promise<string> {
  let message = `${context} error: ${response.status} ${response.statusText}`;
  try {
    const text = await response.text();
    if (text) message = text;
  } catch {
    // Ignore parse failures — keep the status-line message.
  }
  return redactPlexToken(message);
}

async function performFetch(url: string, init: RequestInit, context: string): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new PlexApiError(0, redactPlexToken(`${context} network error: ${detail}`));
  }
}

/** Generic GET for any Plex endpoint (absolute URL; credentials go in headers). */
export async function getAbsolute<T>(
  absoluteUrl: string,
  options: PlexRequestOptions = {}
): Promise<T> {
  const context = options.context ?? DEFAULT_CONTEXT;
  const response = await performFetch(
    absoluteUrl,
    { method: 'GET', headers: buildHeaders(options.auth) },
    context
  );
  if (!response.ok) {
    throw new PlexApiError(response.status, await readErrorMessage(response, context));
  }
  return (await response.json()) as T;
}

/** Generic GET against a Plex Media Server base URL. */
export async function getPath<T>(baseUrl: string, token: string, path: string): Promise<T> {
  return getAbsolute<T>(`${baseUrl}${path}`, { auth: { token } });
}

/** Generic JSON POST for any Plex endpoint (absolute URL; credentials go in headers). */
export async function postAbsolute<T>(
  absoluteUrl: string,
  body: unknown,
  options: PlexRequestOptions = {}
): Promise<T> {
  const context = options.context ?? DEFAULT_CONTEXT;
  const response = await performFetch(
    absoluteUrl,
    {
      method: 'POST',
      headers: { ...buildHeaders(options.auth), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    context
  );
  if (!response.ok) {
    throw new PlexApiError(response.status, await readErrorMessage(response, context));
  }
  return (await response.json()) as T;
}

/** Generic PUT for any Plex endpoint (absolute URL; credentials go in headers). */
export async function putAbsolute(absoluteUrl: string, token: string): Promise<void> {
  const response = await performFetch(
    absoluteUrl,
    { method: 'PUT', headers: buildHeaders({ token }) },
    DEFAULT_CONTEXT
  );
  if (!response.ok) {
    throw new PlexApiError(response.status, await readErrorMessage(response, DEFAULT_CONTEXT));
  }
}
