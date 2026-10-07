import { isSimulatorIdentifier } from './simulator-pairing.mjs';

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Formats the server addresses and handoff status without accepting pairing material.
 *
 * @param {{ bfmUrl: string, controlUrl: string }} options
 * @returns {string}
 */
export function formatServeOnlyStatus({ bfmUrl, controlUrl }) {
  return (
    `\nios-e2e: server address ${bfmUrl}\n` +
    `ios-e2e: recovery-flow server address ${controlUrl} (same bfm, switchable)\n` +
    'ios-e2e: the selected simulator claimed its pairing handoff; Ctrl-C to tear this down.\n\n'
  );
}

/**
 * Pairs one explicitly selected simulator through the local handoff and returns no pairing material.
 *
 * @param {{ controlUrl: string, deviceId: string, handoff: ReturnType<typeof import('./pairing-handoff.mjs').createPairingHandoff>, fetchImpl?: typeof fetch, timeoutMs?: number }} options
 * @returns {Promise<void>}
 */
export async function pairSimulatorForServeOnly({
  controlUrl,
  deviceId,
  handoff,
  fetchImpl = fetch,
  timeoutMs = 5 * 60 * 1000,
}) {
  let origin;
  try {
    origin = new URL(controlUrl);
  } catch {
    throw new Error('ios-e2e serve-only pairing requires the local control plane.');
  }
  if (
    origin.protocol !== 'http:' ||
    origin.hostname !== '127.0.0.1' ||
    origin.port === '' ||
    origin.pathname !== '/' ||
    origin.search !== '' ||
    origin.hash !== '' ||
    origin.username !== '' ||
    origin.password !== '' ||
    !isSimulatorIdentifier(deviceId)
  ) {
    throw new Error('ios-e2e serve-only pairing requires the local control plane.');
  }

  let response;
  try {
    response = await fetchImpl(new URL('/__e2e/pair', origin), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId, pairingBaseUrl: origin.origin }),
    });
  } catch {
    throw new Error('ios-e2e serve-only pairing delivery failed.');
  }
  if (!response.ok) throw new Error('ios-e2e serve-only pairing delivery failed.');

  /** @type {unknown} */
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('ios-e2e serve-only pairing delivery failed.');
  }
  if (
    !isRecord(body) ||
    Object.keys(body).toSorted().join(',') !== 'delivered' ||
    body['delivered'] !== true
  ) {
    throw new Error('ios-e2e serve-only pairing delivery failed.');
  }

  if (!(await handoff.waitForClaim(timeoutMs))) {
    throw new Error('ios-e2e serve-only simulator did not claim the pairing handoff.');
  }
}
