import { InventoryApiError } from '../inventory-api-helpers.js';
/**
 * A mutation client over `POST /sync/mutations` (Inventory ADR-002 D9/D10):
 * builds the wire envelope for one {@link InventoryCommand}, sends it as a
 * one-mutation batch and maps the batch's single outcome back onto a typed
 * result the caller can switch on.
 *
 * The web app never carries a `Pops-Actor` header: it holds no service-account
 * credential (`inventory.sync`), so the server would ignore one anyway and
 * record the change as actor `web` (`rest-sync.ts`) -- this client relies on
 * that default rather than asserting an actor it cannot authenticate.
 */
import { syncMutations } from '../inventory-api/index.js';

import type { SyncMutationsData, SyncMutationsResponses } from '../inventory-api/types.gen.js';
import type { InventoryCommand } from './commands.js';

/** The protocol version this app speaks (Inventory ADR-002 D10); the server's current minimum is `1`. */
export const INVENTORY_SYNC_PROTOCOL = '1';

/** One outcome of `POST /sync/mutations`, as the server reports it. */
export type InventoryMutationOutcome = SyncMutationsResponses[200]['outcomes'][number];

type MutationBody = NonNullable<SyncMutationsData['body']>;
/** The wire envelope for a single mutation inside a batch. */
export type InventoryMutationEnvelope = MutationBody['mutations'][number];

/** What the caller supplies to build one mutation envelope. */
export interface InventoryCommandInput {
  command: InventoryCommand;
  entityId: string;
  /** The revision this client last saw, omitted for a create or a self-checking op. */
  baseRevision?: number;
  /** Mutation ids that must apply first, in this same or an earlier batch. */
  dependsOn?: string[];
  /** Overrides `crypto.randomUUID()`, for tests wanting a stable id. */
  mutationId?: string;
  /** Overrides `new Date().toISOString()`, for tests wanting a stable time. */
  clientTime?: string;
}

/**
 * Build the wire envelope for one command. `mutationId` is the idempotency
 * key the server deduplicates a retried send against, so a caller that
 * retries the same logical change must pass the same `mutationId` back in
 * rather than letting this function mint a new one.
 */
export function buildMutationEnvelope(input: InventoryCommandInput): InventoryMutationEnvelope {
  return {
    mutationId: input.mutationId ?? crypto.randomUUID(),
    op: input.command.op,
    entityId: input.entityId,
    baseRevision: input.baseRevision ?? null,
    dependsOn: input.dependsOn ?? [],
    clientTime: input.clientTime ?? new Date().toISOString(),
    args: input.command.args,
  };
}

/**
 * Send one command as a one-mutation batch and return its outcome.
 *
 * Throws {@link InventoryApiError} for a transport-level failure (400 malformed
 * batch, 426 protocol too old) -- the same failure mode as every other call
 * through this app's generated client. A `conflict`, `rejected` or `deferred`
 * result is not thrown: it is data the caller renders, exactly as `applied` is.
 */
export async function sendInventoryMutation(
  input: InventoryCommandInput
): Promise<InventoryMutationOutcome> {
  const envelope = buildMutationEnvelope(input);
  const result = await syncMutations({
    body: { mutations: [envelope] },
    headers: { 'pops-inventory-protocol': INVENTORY_SYNC_PROTOCOL },
  });
  if (result.error !== undefined) {
    const body = result.error as { message?: unknown };
    const message =
      typeof body.message === 'string' && body.message.length > 0
        ? body.message
        : 'inventory mutation failed';
    throw new InventoryApiError(message, result.response?.status);
  }
  const outcome = result.data?.outcomes[0];
  if (outcome === undefined) {
    throw new InventoryApiError('inventory mutation returned no outcome', result.response?.status);
  }
  return outcome;
}
