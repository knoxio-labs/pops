import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

import { installRequestIdAccessor, readCurrentRequestId } from '../request-context.js';

const REQUEST_ID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const requestIdStorage = new AsyncLocalStorage<string>();

installRequestIdAccessor(() => requestIdStorage.getStore());

/** The header used to correlate a request across the shell and pillars. */
export const REQUEST_ID_HEADER = 'X-Request-Id';

/**
 * Read the request id associated with the current asynchronous server call.
 * Returns undefined when code is running outside an inbound request.
 */
export function getRequestId(): string | undefined {
  return readCurrentRequestId();
}

/**
 * Run a callback with a request id available to SDK calls made through its
 * asynchronous work, including calls separated by await points.
 */
export function runWithRequestId<T>(requestId: string, callback: () => T): T {
  return requestIdStorage.run(requestId, callback);
}

/**
 * Mint a ULID-shaped request id using the current millisecond timestamp and
 * cryptographically random entropy.
 */
export function mintRequestId(now = Date.now()): string {
  const timestamp = encodeUlidTimestamp(now);
  const entropy = randomBytes(10);
  let randomValue = 0n;
  for (const byte of entropy) randomValue = (randomValue << 8n) | BigInt(byte);

  let randomPart = '';
  for (let index = 0; index < 16; index += 1) {
    randomPart = REQUEST_ID_ALPHABET[Number(randomValue & 31n)] + randomPart;
    randomValue >>= 5n;
  }
  return `${timestamp}${randomPart}`;
}

function encodeUlidTimestamp(now: number): string {
  let timestamp = BigInt(Math.max(0, Math.floor(now)));
  let encoded = '';
  for (let index = 0; index < 10; index += 1) {
    encoded = REQUEST_ID_ALPHABET[Number(timestamp & 31n)] + encoded;
    timestamp >>= 5n;
  }
  return encoded;
}
