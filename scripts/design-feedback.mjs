/**
 * Shared client for the design playground's comment API.
 *
 * Two entry points use it — the MCP server a session talks to, and the
 * watcher that blocks until a comment appears — and they must agree on where
 * the API is and how to authenticate, or one of them silently reads a
 * different deployment than the other.
 *
 * Credentials come from the repo-root `.env`, never from arguments: a token
 * on a command line lands in shell history and in process listings.
 */
import { readFileSync } from 'node:fs';

const ENV_PATH = new URL('../.env', import.meta.url);

/**
 * Where a locally-run `design-api` listens (`pillars/design/src/api/boot-env.ts`
 * `DEFAULT_PORT`). Kept in sync by hand — this file runs as plain Node with
 * no loader for the TypeScript source, so it cannot import the constant.
 */
const LOCAL_DESIGN_API_URL = 'http://127.0.0.1:3015';

/** Whether `base` is a loopback address — the local API trusts any caller. */
function isLocalBase(base) {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/u.test(base);
}

/**
 * Read `.env` well enough for the three values this needs. Not a full dotenv
 * parser: no interpolation, no multi-line values, no `export` prefix — a
 * value that needs any of those belongs in the environment instead.
 *
 * @returns {Record<string, string>}
 */
export function loadDotenv() {
  /** @type {Record<string, string>} */
  const values = {};
  let text;
  try {
    text = readFileSync(ENV_PATH, 'utf8');
  } catch {
    return values;
  }
  for (const line of text.split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

/**
 * Build a caller bound to one deployment, or return the reason it cannot be
 * built. Never throws: both consumers report the reason to their own caller
 * rather than dying, because "no token configured" is a normal local state.
 *
 * @param {Record<string, string>} env
 * @returns {{ error: string } | { call: (path: string, init?: RequestInit) => Promise<unknown> }}
 */
export function createClient(env = loadDotenv()) {
  const rawBase = env.POPS_DESIGN_FEEDBACK_URL ?? '';
  const base = (rawBase.trim() === '' ? LOCAL_DESIGN_API_URL : rawBase).replace(/\/$/u, '');
  const local = isLocalBase(base);
  const id = env.CF_ACCESS_CLIENT_ID;
  const secret = env.CF_ACCESS_CLIENT_SECRET;
  if (!local && (!id || !secret)) {
    return {
      error:
        'No Cloudflare Access service token — set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET in .env',
    };
  }
  return {
    async call(path, init = {}) {
      // Built through `Headers` rather than by spreading: `HeadersInit` is
      // also allowed to be an array of pairs, and spreading one of those into
      // an object yields numeric keys and no headers at all.
      const headers = new Headers(init.headers);
      if (id && secret) {
        headers.set('CF-Access-Client-Id', id);
        headers.set('CF-Access-Client-Secret', secret);
      }
      if (!headers.has('content-type')) headers.set('content-type', 'application/json');
      const response = await fetch(`${base}${path}`, { ...init, headers });
      const text = await response.text();
      if (!response.ok) return { error: `${response.status}: ${text.slice(0, 200)}` };
      try {
        return JSON.parse(text);
      } catch {
        return { error: `unparseable response: ${text.slice(0, 200)}` };
      }
    },
  };
}

/**
 * The query string for a thread listing.
 *
 * @param {{ status?: string, route?: string, since?: string }} filter
 * @returns {string}
 */
export function threadsQuery(filter = {}) {
  const params = new URLSearchParams();
  for (const key of ['status', 'route', 'since']) {
    if (filter[key]) params.set(key, filter[key]);
  }
  const query = params.toString();
  return query === '' ? '/threads' : `/threads?${query}`;
}

/**
 * The newest activity stamp across a set of threads, so a watcher can re-arm
 * from where it left off rather than replaying what it already reported.
 *
 * @param {Array<{ createdAt: string, messages?: Array<{ createdAt: string }> }>} threads
 * @param {string} fallback
 * @returns {string}
 */
export function latestStamp(threads, fallback) {
  let latest = fallback;
  for (const thread of threads) {
    if (thread.createdAt > latest) latest = thread.createdAt;
    for (const message of thread.messages ?? []) {
      if (message.createdAt > latest) latest = message.createdAt;
    }
  }
  return latest;
}
