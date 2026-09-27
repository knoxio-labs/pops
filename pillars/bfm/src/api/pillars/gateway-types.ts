type GatewayFailureBase = {
  /** The pillar that was called, by its registered id (e.g. `finance`). */
  readonly pillar: string;
  /** Operator-facing context. Never assume it is safe to show a user. */
  readonly detail?: string;
  /**
   * The producer's own error code, verbatim, when its answer carried one.
   * Lets a route distinguish two failures of the same `kind` by a stable
   * machine token instead of parsing `detail`'s free text.
   */
  readonly code?: string;
  /** The producer's user-safe message, when it returned an ADR-054 envelope. */
  readonly message?: string;
  /** The producer's structured diagnostics, when present. */
  readonly details?: Readonly<Record<string, unknown>>;
  /** The producer's request id, preserved across the relay. */
  readonly requestId?: string;
  /** The producer's retry decision, preserved across the relay. */
  readonly retryable?: boolean;
  /** The producer status before BFM maps it to a status declared by its mobile route. */
  readonly upstreamStatus?: number;
};

/** BFM's failure vocabulary, including the mobile status for each outcome. */
export type GatewayFailure =
  | (GatewayFailureBase & { readonly kind: 'unavailable'; readonly status: 503 })
  | (GatewayFailureBase & {
      readonly kind: 'degraded';
      readonly reason: 'reconciling';
      readonly status: 503;
    })
  | (GatewayFailureBase & { readonly kind: 'contract-mismatch'; readonly status: 502 })
  | (GatewayFailureBase & { readonly kind: 'not-found'; readonly status: 404 })
  | (GatewayFailureBase & { readonly kind: 'conflict'; readonly status: 409 })
  | (GatewayFailureBase & { readonly kind: 'invalid-request'; readonly status: 400 })
  /**
   * The producer answered, understood the request, and will not represent the
   * resource in the form asked for — a receipt that is a PDF rather than a
   * photograph, asked for as an image.
   */
  | (GatewayFailureBase & { readonly kind: 'unsupported-media'; readonly status: 415 })
  | (GatewayFailureBase & { readonly kind: 'gateway-misconfigured'; readonly status: 502 })
  /**
   * This pillar's own `Pops-Inventory-Protocol` is below the inventory
   * pillar's current minimum. The route that answers 426 throws
   * `InventoryProtocolTooOldError` instead of switching on this kind through
   * the normal upstream-error path.
   */
  | (GatewayFailureBase & { readonly kind: 'protocol-too-old'; readonly status: 426 });

/** A successful result returned by the BFM pillar gateway. */
export type GatewaySuccess<TValue> = { readonly kind: 'ok'; readonly value: TValue };

/** The success-or-failure result returned by a BFM pillar gateway call. */
export type GatewayOutcome<TValue> = GatewaySuccess<TValue> | GatewayFailure;

/** Narrow a gateway outcome to its successful arm. */
export function isGatewayOk<TValue>(
  outcome: GatewayOutcome<TValue>
): outcome is GatewaySuccess<TValue> {
  return outcome.kind === 'ok';
}
