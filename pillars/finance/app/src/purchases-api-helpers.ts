/**
 * Helpers for the generated Hey API purchases SDK.
 *
 * Lives outside `src/purchases-api/` because codegen wipes that directory on
 * every regeneration. Anything hand-authored here is safe.
 *
 * `unwrap` turns a Hey API `{ data, error, response }` result into its data
 * payload, throwing `PurchasesApiError` on failure. The throw carries which
 * side failed, because that distinction matters more on this leg than on
 * finance's own: purchases is a separate deployment, and a finance view that
 * reported its own transaction as broken because a sibling pillar was down
 * would be blaming the wrong thing.
 *
 * A transport failure is one where the pillar never answered in its own
 * contract — `fetch` threw, the request was aborted, or the body did not parse. The second case is not
 * hypothetical here: the client is pinned to a same-origin proxy path, and an
 * unrouted proxy answers `200` with the SPA's `index.html`, which reaches the
 * SDK as a parser error under a success status. Classifying that by status
 * alone would call a deployment fault a refusal.
 *
 * Transport failures also drop the underlying message rather than re-throwing
 * it. The shell installs a global `QueryCache` `onError` that pattern-matches
 * fetch's own wording and raises a "check your connection" toast; a sibling
 * pillar being unreachable is not the reader's connection, and it is not this
 * app's whole page.
 */

/** Which side failed: the pillar's own answer, or everything before it. */
export type PurchasesApiFailure = 'api' | 'transport';

const TRANSPORT_MESSAGE = 'purchases pillar did not answer in its own contract';

export class PurchasesApiError extends Error {
  readonly status: number | undefined;
  readonly failure: PurchasesApiFailure;
  constructor(message: string, status: number | undefined, failure: PurchasesApiFailure) {
    super(message);
    this.name = 'PurchasesApiError';
    this.status = status;
    this.failure = failure;
  }
}

function serverMessage(error: object): string | null {
  if (!('message' in error)) return null;
  const { message } = error;
  return typeof message === 'string' && message.length > 0 ? message : null;
}

/**
 * A parsed JSON error body, as opposed to something that was thrown.
 *
 * Tested by prototype rather than with `instanceof Error`, because the two
 * most common transport failures are not both `Error`s: `fetch` rejects with a
 * `TypeError`, but an aborted or timed-out request rejects with a
 * `DOMException`, which is not an `Error` subclass in a browser and does carry
 * a `message`. Copying that message onward is exactly what raises the shell's
 * connection toast.
 */
function isParsedErrorBody(error: unknown): error is object {
  if (typeof error !== 'object' || error === null) return false;
  const proto: unknown = Object.getPrototypeOf(error);
  return proto === Object.prototype || proto === null;
}

/** Only the status is read, so a caller need not hand over a whole `Response`. */
interface SdkResult<T> {
  data?: T;
  error?: unknown;
  response?: { status: number };
}

export function unwrap<T>(result: SdkResult<T>): T {
  const status = result.response?.status;
  if (result.error !== undefined) {
    if (!isParsedErrorBody(result.error)) {
      throw new PurchasesApiError(TRANSPORT_MESSAGE, status, 'transport');
    }
    throw new PurchasesApiError(
      serverMessage(result.error) ?? 'purchases API request failed',
      status,
      'api'
    );
  }
  if (result.data === undefined) {
    throw new PurchasesApiError(TRANSPORT_MESSAGE, status, 'transport');
  }
  return result.data;
}

/**
 * True when the failure says nothing about the transaction on screen: the
 * pillar was unreachable, answered outside its contract, or failed server-side.
 */
export function isUnavailableError(err: unknown): boolean {
  if (!(err instanceof PurchasesApiError)) return false;
  return err.failure === 'transport' || err.status === undefined || err.status >= 500;
}
