import type {
  MobileInventoryMediaClient,
  ReadInventoryMedia,
  StoredInventoryMedia,
} from '../inventory/media-client.js';
/**
 * A stand-in for `inventory/media-client.ts`'s `MobileInventoryMediaClient`.
 *
 * Unlike `inventory-fake.ts`, this does not go through a `PillarGateway` —
 * the media client speaks raw HTTP, never `pillar()` — so there is no
 * `PillarHandleFactory` to fake underneath. This fake implements the client
 * interface directly, which is what `mobile-inventory-handlers.ts` actually
 * depends on.
 */
import type { GatewayOutcome } from '../pillars/gateway.js';

export interface InventoryMediaUploadCall {
  readonly sha256: string;
  readonly mediaType: string;
  readonly byteLength: number;
}

export interface InventoryMediaReadCall {
  readonly sha256: string;
  readonly variant: string;
}

export interface InventoryMediaFake {
  client: MobileInventoryMediaClient;
  uploadCalls: InventoryMediaUploadCall[];
  readCalls: InventoryMediaReadCall[];
}

export interface InventoryMediaFakeOptions {
  /** Defaults to `{ kind: 'ok', value: { sha256: <the one uploaded>, alreadyStored: false } }`. */
  uploadResult?: GatewayOutcome<StoredInventoryMedia>;
  /** Defaults to a `not-found` failure. */
  readResult?: GatewayOutcome<ReadInventoryMedia>;
}

/** Build a fake `MobileInventoryMediaClient`, recording every call it receives. */
export function createInventoryMediaFake(
  options: InventoryMediaFakeOptions = {}
): InventoryMediaFake {
  const uploadCalls: InventoryMediaUploadCall[] = [];
  const readCalls: InventoryMediaReadCall[] = [];

  const client: MobileInventoryMediaClient = {
    upload: (input) => {
      uploadCalls.push({
        sha256: input.sha256,
        mediaType: input.mediaType,
        byteLength: input.bytes.length,
      });
      return Promise.resolve(
        options.uploadResult ?? {
          kind: 'ok',
          value: { sha256: input.sha256, alreadyStored: false },
        }
      );
    },
    read: (input) => {
      readCalls.push({ sha256: input.sha256, variant: input.variant });
      return Promise.resolve(
        options.readResult ?? { kind: 'not-found', pillar: 'inventory', status: 404 }
      );
    },
  };

  return { client, uploadCalls, readCalls };
}
