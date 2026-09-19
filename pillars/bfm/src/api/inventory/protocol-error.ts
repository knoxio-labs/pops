/**
 * Thrown when the inventory pillar answers `426` — this build's
 * `Pops-Inventory-Protocol` is below its current minimum.
 *
 * `426` sits outside `@ts-rest/core`'s `HTTPStatusCode` union
 * (`response-error.ts`), so no `/mobile/inventory/*` handler can return it as
 * a typed value. Handlers throw this instead; `createInventoryProtocolErrorHandler`
 * (mounted after `createExpressEndpoints`, the same position
 * `payload-too-large.ts` uses) catches it and writes the raw response,
 * mirroring how `pillars/inventory/src/api/sync/protocol.ts` answers the same
 * status ahead of its own ts-rest routing.
 */
export class InventoryProtocolTooOldError extends Error {
  override readonly name = 'InventoryProtocolTooOldError' as const;

  constructor(message: string) {
    super(message);
  }
}
