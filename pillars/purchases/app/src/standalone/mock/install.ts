import { matchOperation, type OperationKey } from './router';

/**
 * The purchases REST contract, answered from fixtures instead of a pillar.
 *
 * Interception at `fetch` rather than a second client: the generated Hey API
 * client, its serialisers and the app's own error handling all run exactly as
 * they do against the real pillar, so what the standalone harness exercises is
 * the shipping code path and not a parallel one that can drift from it.
 *
 * Requests to anything other than the purchases API pass straight through. The
 * harness has no business intercepting the page's own module loads, and a
 * pillar this app does not call is not this layer's to answer.
 */

/** What a handler is told about the request it is answering. */
export interface MockRequest {
  readonly method: string;
  /** Path with the API base prefix removed, e.g. `/purchases/ord_1`. */
  readonly path: string;
  /** Path parameters, by the name the operation's template gives them. */
  readonly params: Readonly<Record<string, string>>;
  readonly query: URLSearchParams;
  /** Parsed JSON body, or `undefined` for a request that carried none. */
  readonly body: unknown;
}

/** What a handler answers with. `status` defaults to 200. */
export interface MockResponse {
  readonly status?: number;
  readonly body?: unknown;
}

export type MockHandler = (request: MockRequest) => MockResponse | Promise<MockResponse>;

/** The one thing this layer replaces, named so the target can be typed. */
type FetchLike = typeof globalThis.fetch;

export interface InstallOptions {
  /** Operation key → handler. Keys are OpenAPI operations, not app call sites. */
  readonly handlers: Readonly<Record<OperationKey, MockHandler>>;
  /** Base path the generated client posts to. */
  readonly baseUrl?: string;
  /** Where to install; injectable so a test can drive its own object. */
  readonly target?: { fetch: FetchLike };
  /** Called for a request the contract declares no operation for. */
  readonly onUnhandled?: (method: string, path: string) => void;
}

const DEFAULT_BASE_URL = '/purchases-api';

/**
 * The body an unhandled operation answers with.
 *
 * Shaped like the contract's own error (`{ message, code }`) and returned as a
 * 501 rather than thrown: the app's error paths are what should render, the
 * same way they would against a pillar that had lost a route. A thrown mock
 * would instead surface as a crash in whichever component happened to call
 * first, which says nothing about the gap.
 */
function unhandled(method: string, path: string): MockResponse {
  return {
    status: 501,
    body: {
      code: 'MOCK_NOT_IMPLEMENTED',
      message:
        `No mock handler for '${method} ${path}'. Add one in ` +
        `src/standalone/mock/handlers.ts — the contract declares it, so the ` +
        `standalone harness owes it an answer.`,
    },
  };
}

function requestPath(
  url: string,
  baseUrl: string
): { path: string; query: URLSearchParams } | null {
  const parsed = new URL(url, 'http://standalone.invalid');
  if (!parsed.pathname.startsWith(`${baseUrl}/`) && parsed.pathname !== baseUrl) return null;
  return { path: parsed.pathname.slice(baseUrl.length) || '/', query: parsed.searchParams };
}

async function readBody(init: RequestInit | undefined, input: RequestInfo | URL): Promise<unknown> {
  const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
  if (typeof raw !== 'string' || raw === '') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    // A body the pillar could not parse either. Handlers see `undefined` and
    // answer as they would for a missing one.
    return undefined;
  }
}

/**
 * Install the mock over `target.fetch`.
 *
 * @returns A function restoring the previous `fetch`. Calling it twice is safe.
 */
export function installPurchasesApiMock(options: InstallOptions): () => void {
  const { handlers, baseUrl = DEFAULT_BASE_URL, onUnhandled } = options;
  const target: { fetch: FetchLike } = options.target ?? globalThis;
  const passThrough: FetchLike = target.fetch.bind(target);
  const keys = Object.keys(handlers);

  const mockedFetch: FetchLike = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const parsed = requestPath(url, baseUrl);
    if (parsed === null) return passThrough(input, init);

    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    const matched = matchOperation(method, parsed.path, keys);
    const handler = matched === undefined ? undefined : handlers[matched.key];

    if (matched === undefined || handler === undefined) {
      onUnhandled?.(method, parsed.path);
      return jsonResponse(unhandled(method, parsed.path));
    }

    const answer = await handler({
      method,
      path: parsed.path,
      params: matched.params,
      query: parsed.query,
      body: await readBody(init, input),
    });
    return jsonResponse(answer);
  };

  target.fetch = mockedFetch;

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    target.fetch = passThrough;
  };
}

function jsonResponse(answer: MockResponse): Response {
  const status = answer.status ?? 200;
  const body = answer.body === undefined ? null : JSON.stringify(answer.body);
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
