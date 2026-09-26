const REQUEST_TIMEOUT_MS = 4_000;

interface JsonResponse {
  readonly response: Response;
  readonly body: unknown | undefined;
}

/** Fetch one JSON response under the source request deadline. */
export async function fetchJson(
  fetcher: typeof fetch,
  url: string,
  signal: AbortSignal,
  headers: NonNullable<Parameters<typeof fetch>[1]>['headers']
): Promise<JsonResponse | undefined> {
  try {
    const response = await fetcher(url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    });
    if (!response.ok) return { response, body: undefined };
    const body: unknown = await response.json();
    return { response, body };
  } catch {
    return undefined;
  }
}
