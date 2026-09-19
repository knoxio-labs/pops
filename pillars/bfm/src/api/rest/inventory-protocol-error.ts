import { InventoryProtocolTooOldError } from '../inventory/protocol-error.js';

/**
 * Answers `InventoryProtocolTooOldError` with the raw `426` it names.
 *
 * Mounted after `createExpressEndpoints`, the same position
 * `payload-too-large.ts` uses and for the same reason: the status this
 * handler writes is not one a ts-rest handler can return as a typed value
 * (`@ts-rest/core`'s `HTTPStatusCode` union has no `426`), so the handler
 * throws and this is where the throw is turned into bytes on the wire.
 */
import type { MobileClientTooOldError } from '../../contract/mobile-inventory-schemas.js';

/** All this handler does to the response. See `payload-too-large.ts`'s own note. */
type JsonResponse = { status: (code: number) => { json: (body: unknown) => unknown } };

/** The one call this handler makes into express's chain. See `payload-too-large.ts`. */
type PassToNext = (error?: unknown) => void;

export function createInventoryProtocolErrorHandler() {
  return (error: unknown, _req: unknown, res: JsonResponse, next: PassToNext): void => {
    if (!(error instanceof InventoryProtocolTooOldError)) {
      next(error);
      return;
    }

    const body: MobileClientTooOldError = {
      code: 'client_too_old',
      message: error.message,
    };
    res.status(426).json(body);
  };
}
