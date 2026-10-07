import { createServer } from 'node:http';

import { boundAddress } from './server-address.mjs';

const SIMULATOR_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;
const HANDOFF_INSTANCE_ID = /^[0-9]+-[0-9]+-[0-9]+$/u;
const PAIRING_CODE = /^[2-9A-HJ-NP-Z]{4}(?:-[2-9A-HJ-NP-Z]{4}){2}$/u;
const CLAIM_PATH = '/__e2e/pair/claim';
const COMPLETION_PATH = '/__e2e/pair/complete';
const MAX_BODY_BYTES = 1024;
const PAIRING_HANDOFF_TIMEOUT_MS = 5 * 60 * 1000;
const PAIRING_COMPLETION_TIMEOUT_MS = 120_000;
let nextHandoffInstance = 1;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks the public process timestamp and handoff sequence used to reject stale triggers.
 *
 * @param {string} instanceId
 * @returns {boolean}
 */
export function isHandoffInstanceIdentifier(instanceId) {
  return HANDOFF_INSTANCE_ID.test(instanceId);
}

/**
 * Holds one simulator's pairing details in process memory until its exact
 * handoff generation claims them once or the code expires, then records whether
 * the app stored a session for that BFM origin.
 *
 * @param {{ deviceId: string, now?: () => number }} options
 * @returns {{ instanceId: string, offer: (details: { deviceId: string, pairingBaseUrl: string, code: string, expiresAt: string }) => number, claim: (request: { deviceId: string, instanceId: string, generation: number }) => { deviceId: string, instanceId: string, generation: number, pairingBaseUrl: string, code: string, expiresAt: string } | null, complete: (request: { deviceId: string, instanceId: string, generation: number, paired: boolean }) => boolean, readCounts: () => { claims: number, completions: number, paired: number }, clear: (generation?: number) => void, reset: () => void, waitForClaim: (timeoutMs: number) => Promise<boolean>, waitForPairing: (timeoutMs?: number) => Promise<boolean> }}
 */
export function createPairingHandoff({ deviceId, now = Date.now }) {
  if (!SIMULATOR_ID.test(deviceId)) throw new Error('ios-e2e simulator ID is invalid.');

  const instanceId = `${process.pid}-${Math.trunc(performance.timeOrigin)}-${nextHandoffInstance}`;
  nextHandoffInstance += 1;

  /** @type {{ deviceId: string, generation: number, pairingBaseUrl: string, code: string, expiresAt: string, expiresAtMs: number } | null} */
  let pending = null;
  /** @type {number | null} */
  let activeGeneration = null;
  /** @type {number | null} */
  let activeCodeExpiresAtMs = null;
  /** @type {number | null} */
  let completionExpiresAtMs = null;
  /** @type {Set<(claimed: boolean) => void>} */
  const claimWaiters = new Set();
  /** @type {Set<(paired: boolean) => void>} */
  const pairingWaiters = new Set();
  let hasClaimed = false;
  let claimCount = 0;
  let completionCount = 0;
  let pairedCount = 0;
  /** @type {boolean | null} */
  let pairingResult = null;
  let nextGeneration = 0;

  /** @param {number} [generation] */
  const clear = (generation) => {
    if (generation !== undefined && generation !== activeGeneration) return;
    pending = null;
    activeGeneration = null;
    activeCodeExpiresAtMs = null;
    completionExpiresAtMs = null;
    hasClaimed = false;
    pairingResult = null;
    for (const waiter of claimWaiters) waiter(false);
    for (const waiter of pairingWaiters) waiter(false);
  };

  /** @param {number} timeoutMs */
  const waitForClaim = (timeoutMs) => {
    if (hasClaimed) return Promise.resolve(true);
    if (timeoutMs <= 0 || pending === null || activeCodeExpiresAtMs === null) {
      return Promise.resolve(false);
    }
    const remainingMs = Math.min(timeoutMs, activeCodeExpiresAtMs - now());
    if (remainingMs <= 0) return Promise.resolve(false);
    return new Promise((resolve) => {
      /** @param {boolean} claimed */
      const finish = (claimed) => {
        clearTimeout(timeout);
        claimWaiters.delete(onClaim);
        resolve(claimed);
      };
      /** @param {boolean} claimed */
      const onClaim = (claimed) => finish(claimed);
      const timeout = setTimeout(() => finish(false), remainingMs);
      claimWaiters.add(onClaim);
    });
  };

  /** @param {number} [timeoutMs] */
  const waitForPairing = async (timeoutMs = PAIRING_HANDOFF_TIMEOUT_MS) => {
    if (!(await waitForClaim(timeoutMs))) return false;
    if (pairingResult !== null) return pairingResult;
    if (timeoutMs <= 0 || completionExpiresAtMs === null) return false;
    const remainingMs = Math.min(timeoutMs, completionExpiresAtMs - now());
    if (remainingMs <= 0) return false;
    return new Promise((resolve) => {
      /** @param {boolean} paired */
      const finish = (paired) => {
        clearTimeout(timeout);
        pairingWaiters.delete(onPairing);
        resolve(paired);
      };
      /** @param {boolean} paired */
      const onPairing = (paired) => finish(paired);
      const timeout = setTimeout(() => finish(false), remainingMs);
      pairingWaiters.add(onPairing);
    });
  };

  return {
    instanceId,
    readCounts() {
      return { claims: claimCount, completions: completionCount, paired: pairedCount };
    },
    offer({ deviceId: targetDeviceId, pairingBaseUrl, code, expiresAt }) {
      if (
        targetDeviceId !== deviceId ||
        !SIMULATOR_ID.test(targetDeviceId) ||
        !PAIRING_CODE.test(code)
      ) {
        throw new Error('ios-e2e pairing handoff is invalid.');
      }

      /** @type {URL} */
      let baseUrl;
      try {
        baseUrl = new URL(pairingBaseUrl);
      } catch {
        throw new Error('ios-e2e pairing handoff is invalid.');
      }
      if (
        !['http:', 'https:'].includes(baseUrl.protocol) ||
        baseUrl.host === '' ||
        baseUrl.pathname !== '/' ||
        baseUrl.search !== '' ||
        baseUrl.hash !== '' ||
        baseUrl.username !== '' ||
        baseUrl.password !== '' ||
        (baseUrl.protocol === 'http:' && baseUrl.hostname !== '127.0.0.1')
      ) {
        throw new Error('ios-e2e pairing handoff is invalid.');
      }

      const expiresAtMs = Date.parse(expiresAt);
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now()) {
        throw new Error('ios-e2e pairing handoff is expired.');
      }
      if (
        (pending !== null && pending.expiresAtMs > now()) ||
        (hasClaimed &&
          pairingResult === null &&
          completionExpiresAtMs !== null &&
          completionExpiresAtMs > now())
      ) {
        throw new Error('ios-e2e pairing handoff is already pending.');
      }

      clear();
      hasClaimed = false;
      nextGeneration += 1;
      if (!Number.isSafeInteger(nextGeneration)) {
        throw new Error('ios-e2e pairing handoff is unavailable.');
      }
      pending = {
        deviceId,
        generation: nextGeneration,
        pairingBaseUrl: baseUrl.origin,
        code,
        expiresAt,
        expiresAtMs,
      };
      activeGeneration = nextGeneration;
      activeCodeExpiresAtMs = expiresAtMs;
      return nextGeneration;
    },

    claim({ deviceId: requestedDeviceId, instanceId: requestedInstanceId, generation }) {
      if (pending === null) return null;
      if (pending.expiresAtMs <= now()) {
        pending = null;
        return null;
      }
      if (
        requestedDeviceId !== pending.deviceId ||
        requestedDeviceId !== deviceId ||
        requestedInstanceId !== instanceId ||
        generation !== pending.generation
      ) {
        return null;
      }

      const current = pending;
      pending = null;
      hasClaimed = true;
      claimCount += 1;
      completionExpiresAtMs = now() + PAIRING_COMPLETION_TIMEOUT_MS;
      for (const waiter of claimWaiters) waiter(true);
      return {
        deviceId: current.deviceId,
        instanceId,
        generation: current.generation,
        pairingBaseUrl: current.pairingBaseUrl,
        code: current.code,
        expiresAt: current.expiresAt,
      };
    },

    complete({ deviceId: reportedDeviceId, instanceId: reportedInstanceId, generation, paired }) {
      if (
        !hasClaimed ||
        pairingResult !== null ||
        activeGeneration !== generation ||
        reportedDeviceId !== deviceId ||
        reportedInstanceId !== instanceId ||
        completionExpiresAtMs === null ||
        completionExpiresAtMs <= now()
      ) {
        return false;
      }
      pairingResult = paired;
      completionCount += 1;
      if (paired) pairedCount += 1;
      for (const waiter of pairingWaiters) waiter(paired);
      return true;
    },

    reset() {
      clear();
    },

    clear,
    waitForClaim,
    waitForPairing,
  };
}

/**
 * Handles the loopback app's one-time claim request without forwarding it to
 * the BFM.
 *
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 * @param {ReturnType<typeof createPairingHandoff>} handoff
 * @returns {Promise<boolean>}
 */
export async function handlePairingClaim(request, response, handoff) {
  if (request.url !== CLAIM_PATH) return false;
  /** @param {number} status @param {unknown} body */
  const json = (status, body) => {
    response.writeHead(status, {
      'cache-control': 'no-store',
      'content-type': 'application/json',
      pragma: 'no-cache',
    });
    response.end(JSON.stringify(body));
  };
  if (request.method !== 'POST') {
    json(405, { message: 'ios-e2e pairing handoff is unavailable.' });
    return true;
  }

  /** @type {Buffer[]} */
  const chunks = [];
  let bytes = 0;
  try {
    for await (const chunk of request) {
      const body = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += body.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        json(400, { message: 'ios-e2e pairing claim is invalid.' });
        return true;
      }
      chunks.push(body);
    }
  } catch {
    json(400, { message: 'ios-e2e pairing claim is invalid.' });
    return true;
  }

  /** @type {unknown} */
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    json(400, { message: 'ios-e2e pairing claim is invalid.' });
    return true;
  }
  if (
    !isRecord(body) ||
    Object.keys(body).toSorted().join(',') !== 'deviceId,generation,instanceId' ||
    typeof body['deviceId'] !== 'string' ||
    !SIMULATOR_ID.test(body['deviceId']) ||
    typeof body['instanceId'] !== 'string' ||
    !isHandoffInstanceIdentifier(body['instanceId']) ||
    typeof body['generation'] !== 'number' ||
    !Number.isSafeInteger(body['generation']) ||
    body['generation'] < 1
  ) {
    json(400, { message: 'ios-e2e pairing claim is invalid.' });
    return true;
  }

  const claim = handoff.claim({
    deviceId: body['deviceId'],
    instanceId: body['instanceId'],
    generation: body['generation'],
  });
  if (claim === null) {
    json(409, { message: 'ios-e2e pairing handoff is unavailable.' });
    return true;
  }
  json(200, claim);
  return true;
}

/**
 * Accepts one pairing result from the simulator after it stores the session.
 *
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 * @param {ReturnType<typeof createPairingHandoff>} handoff
 * @returns {Promise<boolean>}
 */
export async function handlePairingCompletion(request, response, handoff) {
  if (request.url !== COMPLETION_PATH) return false;
  /** @param {number} status @param {unknown} body */
  const json = (status, body) => {
    response.writeHead(status, {
      'cache-control': 'no-store',
      'content-type': 'application/json',
      pragma: 'no-cache',
    });
    response.end(JSON.stringify(body));
  };
  if (request.method !== 'POST') {
    json(405, { message: 'ios-e2e pairing completion is unavailable.' });
    return true;
  }

  /** @type {Buffer[]} */
  const chunks = [];
  let bytes = 0;
  try {
    for await (const chunk of request) {
      const body = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += body.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        json(400, { message: 'ios-e2e pairing completion is invalid.' });
        return true;
      }
      chunks.push(body);
    }
  } catch {
    json(400, { message: 'ios-e2e pairing completion is invalid.' });
    return true;
  }

  /** @type {unknown} */
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    json(400, { message: 'ios-e2e pairing completion is invalid.' });
    return true;
  }
  if (
    !isRecord(body) ||
    Object.keys(body).toSorted().join(',') !== 'deviceId,generation,instanceId,paired' ||
    typeof body['deviceId'] !== 'string' ||
    !SIMULATOR_ID.test(body['deviceId']) ||
    typeof body['instanceId'] !== 'string' ||
    !isHandoffInstanceIdentifier(body['instanceId']) ||
    typeof body['generation'] !== 'number' ||
    !Number.isSafeInteger(body['generation']) ||
    body['generation'] < 1 ||
    typeof body['paired'] !== 'boolean'
  ) {
    json(400, { message: 'ios-e2e pairing completion is invalid.' });
    return true;
  }

  const accepted = handoff.complete({
    deviceId: body['deviceId'],
    instanceId: body['instanceId'],
    generation: body['generation'],
    paired: body['paired'],
  });
  if (!accepted) {
    json(409, { message: 'ios-e2e pairing completion is stale or unavailable.' });
    return true;
  }

  response.writeHead(204, { 'cache-control': 'no-store', pragma: 'no-cache' });
  response.end();
  return true;
}

/**
 * Handles one of the loopback broker's claim or pairing-completion requests.
 *
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 * @param {ReturnType<typeof createPairingHandoff>} handoff
 * @returns {Promise<boolean>}
 */
export async function handlePairingHandoffRequest(request, response, handoff) {
  if (await handlePairingClaim(request, response, handoff)) return true;
  return handlePairingCompletion(request, response, handoff);
}

/**
 * Starts a minimal loopback broker for the standalone simulator pairing task.
 *
 * @param {ReturnType<typeof createPairingHandoff>} handoff
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function startPairingHandoffServer(handoff) {
  const server = createServer((request, response) => {
    void handlePairingHandoffRequest(request, response, handoff).then((handled) => {
      if (!handled) {
        response.writeHead(404, {
          'cache-control': 'no-store',
          'content-type': 'application/json',
          pragma: 'no-cache',
        });
        response.end('{"message":"ios-e2e pairing handoff is unavailable."}');
      }
    });
  });
  /** @type {Promise<void>} */
  const listening = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  await listening;
  const { port } = boundAddress(server, 'ios-e2e pairing handoff');
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      ),
  };
}
