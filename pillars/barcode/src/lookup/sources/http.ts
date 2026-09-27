const REQUEST_TIMEOUT_MS = 4_000;

interface JsonResponse {
  readonly kind: 'response';
  readonly response: Response;
  readonly body?: unknown;
}

interface JsonFailure {
  readonly kind: 'failure';
  readonly failureClass: 'invalid_response' | 'network_error' | 'timeout';
}

type JsonResult = JsonResponse | JsonFailure;

/** Fetch one JSON response under the source request deadline. */
export async function fetchJson(
  fetcher: typeof fetch,
  url: string,
  signal: AbortSignal,
  headers: NonNullable<Parameters<typeof fetch>[1]>['headers']
): Promise<JsonResult> {
  let response: Response;
  try {
    response = await fetcher(url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    });
  } catch (error) {
    return {
      kind: 'failure',
      failureClass:
        error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
          ? 'timeout'
          : 'network_error',
    };
  }
  if (!response.ok) return { kind: 'response', response };
  try {
    const body: unknown = await response.json();
    return { kind: 'response', response, body };
  } catch {
    return { kind: 'failure', failureClass: 'invalid_response' };
  }
}
