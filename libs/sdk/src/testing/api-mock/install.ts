import { matchOperation, type OperationKey } from './router.js';

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

/** Answers one contract operation from fixtures. */
export type MockHandler = (request: MockRequest) => MockResponse | Promise<MockResponse>;

/** Operation key → handler. Keys are OpenAPI operations, not app call sites. */
export type MockHandlers = Readonly<Record<OperationKey, MockHandler>>;

type FetchLike = typeof globalThis.fetch;

/** Where and how {@link installApiMock} intercepts. */
export interface InstallApiMockOptions {
  readonly handlers: MockHandlers;
  /** Base path the generated client posts to, e.g. `/purchases-api`. */
  readonly baseUrl: string;
  /** Where to install; injectable so a test can drive its own object. */
  readonly target?: { fetch: FetchLike };
  /** Called for a request under `baseUrl` that no handler key accepts. */
  readonly onUnhandled?: (method: string, path: string) => void;
}

/**
 * Shaped like the contracts' own error (`{ message, code }`) and returned as a
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
        `No mock handler for '${method} ${path}'. The contract declares it, so ` +
        `the standalone harness owes it an answer.`,
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

function jsonResponse(answer: MockResponse): Response {
  const status = answer.status ?? 200;
  const body = answer.body === undefined ? null : JSON.stringify(answer.body);
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Answer one pillar's REST contract from fixtures instead of the pillar, by
 * replacing `target.fetch` (default `globalThis`).
 *
 * Interception at `fetch` rather than a second client: the generated Hey API
 * client, its serialisers and the app's own error handling all run exactly as
 * they do against the real pillar, so what a standalone harness exercises is
 * the shipping code path and not a parallel one that can drift from it.
 *
 * Requests outside `baseUrl` pass through to whatever `fetch` was installed
 * before, so one call per contract composes: an app that talks to three
 * pillars installs three mocks, each answering only its own prefix. Restore
 * them in reverse order.
 *
 * @returns A function restoring the previous `fetch`. Calling it twice is safe.
 */
export function installApiMock(options: InstallApiMockOptions): () => void {
  const { handlers, baseUrl, onUnhandled } = options;
  const target: { fetch: FetchLike } = options.target ?? globalThis;
  const previous = target.fetch;
  const passThrough: FetchLike = (input, init) => previous.call(target, input, init);
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
    target.fetch = previous;
  };
}
