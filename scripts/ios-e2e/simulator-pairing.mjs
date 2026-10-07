#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PairingMcpFailure,
  formatPairingMcpFailure,
  isPairingCode,
  issuePairingCodeViaMcp,
} from './mcp-pairing-code.mjs';
import { PairingArtifactScanFailure, scanPairingArtifacts } from './pairing-artifact-guard.mjs';
import {
  createPairingHandoff,
  isHandoffInstanceIdentifier,
  startPairingHandoffServer,
} from './pairing-handoff.mjs';

/** @typedef {(command: string, args: string[], options: import('node:child_process').SpawnOptions) => import('node:child_process').ChildProcess} SpawnImplementation */

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

/**
 * Builds the simulator-only trigger for a loopback pairing broker.
 *
 * @param {{ brokerUrl: string, deviceId: string, instanceId: string, generation: number }} options
 * @returns {string}
 */
export function simulatorPairingURL({ brokerUrl, deviceId, instanceId, generation }) {
  if (
    !isSimulatorIdentifier(deviceId) ||
    !isHandoffInstanceIdentifier(instanceId) ||
    !Number.isSafeInteger(generation) ||
    generation < 1
  ) {
    throw new Error('ios-e2e simulator pairing trigger is invalid.');
  }
  let broker;
  try {
    broker = new URL(brokerUrl);
  } catch {
    throw new Error('ios-e2e simulator pairing trigger is invalid.');
  }
  if (
    broker.protocol !== 'http:' ||
    broker.hostname !== '127.0.0.1' ||
    broker.port === '' ||
    broker.pathname !== '/' ||
    broker.search !== '' ||
    broker.hash !== '' ||
    broker.username !== '' ||
    broker.password !== ''
  ) {
    throw new Error('ios-e2e simulator pairing trigger is invalid.');
  }
  const url = new URL('pops://e2e-pairing');
  url.searchParams.set('broker', broker.origin);
  url.searchParams.set('deviceId', deviceId);
  url.searchParams.set('instanceId', instanceId);
  url.searchParams.set('generation', String(generation));
  return url.href;
}

/**
 * Builds the BFM pairing URL for a validated code and origin.
 *
 * @param {string} baseUrl
 * @param {string} code
 * @returns {string}
 */
function bfmPairingURL(baseUrl, code) {
  const url = new URL('/devices/pair', baseUrl);
  url.searchParams.set('code', code);
  return url.href;
}

/**
 * Checks the UUID-shaped simulator identifier accepted by `simctl`.
 *
 * @param {string} deviceId
 * @returns {boolean}
 */
export function isSimulatorIdentifier(deviceId) {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu.test(deviceId);
}

/**
 * Scans artifacts from the selected simulator after a live pairing attempt.
 *
 * @param {{ deviceId: string, afterMs: number, materials: Array<{ code: string, pairingUrl: string }> }} options
 * @returns {Promise<{ scannedFiles: number, scannedRoots: number, totalRoots: number, filesWithPairingMaterial: number } >}
 */
export function scanSimulatorPairingArtifacts({ deviceId, afterMs, materials }) {
  if (!isSimulatorIdentifier(deviceId)) {
    throw new Error('ios-e2e selected simulator ID is invalid.');
  }
  const simulatorLogRoot = join(homedir(), 'Library', 'Logs', 'CoreSimulator', deviceId);
  return scanPairingArtifacts({
    root: simulatorLogRoot,
    additionalRoots: [join(homedir(), '.maestro', 'tests')],
    requiredRoots: [simulatorLogRoot],
    afterMs,
    materials,
  });
}

/**
 * Issues one code and opens a non-secret trigger for the selected simulator.
 * The code stays in host memory and the simulator receives only a loopback
 * broker trigger with public target metadata. When `expectedPairingOrigin` is
 * supplied, the issuer URL must use that exact HTTPS origin.
 *
 * @param {{
 *   issuer?: 'direct' | 'mcp',
 *   endpoint: string,
 *   pairingBaseUrl?: string,
 *   expectedPairingOrigin?: string,
 *   brokerUrl: string,
 *   handoff: ReturnType<typeof createPairingHandoff>,
 *   onPairingIssued?: (material: { code: string, pairingUrl: string }) => void,
 *   token?: string,
 *   deviceId: string,
 *   fetchImpl?: typeof fetch,
 *   spawnImpl?: SpawnImplementation
 * }} options
 * @returns {Promise<number>}
 */
export async function issueAndOpenPairingLink({
  issuer = 'mcp',
  endpoint,
  pairingBaseUrl,
  expectedPairingOrigin,
  brokerUrl,
  handoff,
  onPairingIssued,
  token,
  deviceId,
  fetchImpl = fetch,
  spawnImpl = spawn,
}) {
  if (!isSimulatorIdentifier(deviceId) || handoff === undefined || brokerUrl === undefined)
    return 1;

  const expectedOrigin =
    expectedPairingOrigin === undefined
      ? undefined
      : normalizeExpectedPairingOrigin(expectedPairingOrigin);
  if (expectedPairingOrigin !== undefined && expectedOrigin === null) {
    throw new Error('expected BFM origin is invalid');
  }

  const pairing =
    issuer === 'mcp'
      ? await issuePairingCodeViaMcp({ endpoint, token, fetchImpl })
      : await issuePairingCodeDirectly({ endpoint, fetchImpl });
  onPairingIssued?.({ code: pairing.code, pairingUrl: pairing.pairingUrl });

  const issuedPairingDetails = detailsFromIssuedPairing(
    pairing.pairingUrl,
    pairing.code,
    pairing.expiresAt,
    expectedOrigin ?? undefined
  );
  const pairingDetails = pairingBaseUrl
    ? detailsFromIssuedPairing(
        bfmPairingURL(pairingBaseUrl, pairing.code),
        pairing.code,
        pairing.expiresAt,
        expectedOrigin ?? undefined
      )
    : issuedPairingDetails;
  const generation = handoff.offer({ deviceId, ...pairingDetails });
  try {
    const link = simulatorPairingURL({
      brokerUrl,
      deviceId,
      instanceId: handoff.instanceId,
      generation,
    });
    const exitCode = await runSimctlOpenURL(deviceId, link, spawnImpl);
    if (exitCode !== 0) handoff.clear(generation);
    return exitCode;
  } catch (error) {
    handoff.clear(generation);
    throw error;
  }
}

/**
 * Validates the issuer's pairing URL and reduces it to the details the broker
 * returns in a non-cacheable JSON body.
 *
 * @param {string} pairingUrl
 * @param {string} issuedCode
 * @param {string} expiresAt
 * @param {string} [expectedOrigin]
 * @returns {{ pairingBaseUrl: string, code: string, expiresAt: string }}
 */
function detailsFromIssuedPairing(pairingUrl, issuedCode, expiresAt, expectedOrigin) {
  let url;
  try {
    url = new URL(pairingUrl);
  } catch {
    throw new Error('pairing response was invalid');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.pathname !== '/devices/pair' ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== '' ||
    url.searchParams.getAll('code').length !== 1 ||
    url.searchParams.get('code') !== issuedCode ||
    [...url.searchParams.keys()].some((key) => key !== 'code') ||
    (expectedOrigin !== undefined && url.origin !== expectedOrigin)
  ) {
    throw new Error('pairing response was invalid');
  }
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new Error('pairing response was invalid');
  }
  return { pairingBaseUrl: url.origin, code: issuedCode, expiresAt };
}

/**
 * Accepts only a credential-free HTTPS origin for a live BFM pairing.
 *
 * @param {string} value
 * @returns {string | null}
 */
function normalizeExpectedPairingOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== 'https:' ||
    url.host === '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== '' ||
    url.username !== '' ||
    url.password !== ''
  ) {
    return null;
  }
  return url.origin;
}

/**
 * Issues one pairing code directly from a non-production BFM harness.
 *
 * @param {{ endpoint: string, fetchImpl: typeof fetch }} options
 * @returns {Promise<{ code: string, pairingUrl: string, expiresAt: string }>}
 */
async function issuePairingCodeDirectly({ endpoint, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(new URL('/operator/pairing/codes', endpoint), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
  } catch {
    throw new Error('direct pairing request failed');
  }
  if (!response.ok) throw new Error('direct pairing request failed');

  /** @type {unknown} */
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('direct pairing response was invalid');
  }
  if (!isPairingCode(body) || body.code.trim() === '' || body.expiresAt.trim() === '') {
    throw new Error('direct pairing response was invalid');
  }

  return {
    code: body['code'],
    pairingUrl: bfmPairingURL(endpoint, body['code']),
    expiresAt: body['expiresAt'],
  };
}

/** @param {unknown} error */
function formatPairingFailure(error) {
  if (error instanceof PairingMcpFailure) return formatPairingMcpFailure(error);
  return 'ios-e2e: pairing handoff failed; issuance status is unknown. No retry was attempted.';
}

/**
 * Validates the command inputs, issues one simulator pairing link, and writes
 * only a fixed status. Live pairing requires the configured expected HTTPS BFM
 * origin and verifies it before requesting a code.
 *
 * @param {{
 *   endpoint?: string,
 *   token?: string,
 *   expectedPairingOrigin?: string,
 *   deviceId?: string,
 *   issuePairingLink?: (options: { endpoint: string, token?: string, expectedPairingOrigin: string, deviceId: string, brokerUrl: string, handoff: ReturnType<typeof createPairingHandoff>, onPairingIssued: (material: { code: string, pairingUrl: string }) => void }) => Promise<number>,
 *   scanArtifacts?: (options: { deviceId: string, afterMs: number, materials: Array<{ code: string, pairingUrl: string }> }) => Promise<{ scannedFiles: number, scannedRoots: number, totalRoots: number, filesWithPairingMaterial: number }>,
 *   writeStdout?: (message: string) => void,
 *   writeStderr?: (message: string) => void
 * }} options
 * @returns {Promise<number>}
 */
export async function runSimulatorPairing({
  endpoint = process.env['POPS_MCP_URL']?.trim(),
  token = process.env['MCP_INBOUND_TOKEN'],
  expectedPairingOrigin = process.env['POPS_IOS_PAIRING_EXPECTED_BFM_ORIGIN']?.trim(),
  deviceId = process.env['POPS_IOS_SIMULATOR_UDID']?.trim(),
  issuePairingLink,
  scanArtifacts = scanSimulatorPairingArtifacts,
  writeStdout = (message) => {
    process.stdout.write(message);
  },
  writeStderr = (message) => {
    process.stderr.write(message);
  },
} = {}) {
  if (!endpoint || !deviceId) {
    writeStderr('ios-e2e: MCP endpoint and simulator ID are required.\n');
    return 1;
  }

  if (!isSimulatorIdentifier(deviceId)) {
    writeStderr('ios-e2e: selected simulator ID is invalid; no pairing request was sent.\n');
    return 1;
  }

  const expectedOrigin =
    expectedPairingOrigin === undefined
      ? null
      : normalizeExpectedPairingOrigin(expectedPairingOrigin);
  if (expectedOrigin === null) {
    writeStderr(
      'ios-e2e: a credential-free HTTPS BFM origin is required for live simulator pairing.\n'
    );
    return 1;
  }

  const handoff = createPairingHandoff({ deviceId });
  const broker = await startPairingHandoffServer(handoff);
  /** @type {Array<{ code: string, pairingUrl: string }>} */
  const pairingMaterials = [];
  const artifactScanStartedAt = Date.now() - 5_000;
  try {
    /** @type {string | null} */
    let pairingFailure = null;
    try {
      /** @type {(material: { code: string, pairingUrl: string }) => void} */
      const recordPairingMaterial = (material) => {
        pairingMaterials.push(material);
      };
      const issueOptions = {
        endpoint,
        token,
        expectedPairingOrigin: expectedOrigin,
        deviceId,
        brokerUrl: broker.url,
        handoff,
        onPairingIssued: recordPairingMaterial,
      };
      const exitCode =
        issuePairingLink === undefined
          ? await issueAndOpenPairingLink(issueOptions)
          : await issuePairingLink(issueOptions);
      if (exitCode !== 0) {
        pairingFailure = `ios-e2e: pairing code was issued, but simulator link delivery failed (exit ${exitCode}). No retry was attempted.`;
      } else if (!(await handoff.waitForPairing(5 * 60 * 1000))) {
        pairingFailure =
          'ios-e2e: selected simulator did not confirm pairing. Issuance status is uncertain; no retry was attempted.';
      }
    } catch (error) {
      pairingFailure = formatPairingFailure(error).trimEnd();
    }

    /** @type {Awaited<ReturnType<typeof scanSimulatorPairingArtifacts>> | undefined} */
    let artifactScan;
    /** @type {unknown} */
    let artifactScanError;
    try {
      artifactScan = await scanArtifacts({
        deviceId,
        afterMs: artifactScanStartedAt,
        materials: pairingMaterials,
      });
    } catch (error) {
      artifactScanError = error;
    }

    if (artifactScan !== undefined) {
      writeStdout(
        `ios-e2e: pairing artifact scan roots=${artifactScan.scannedRoots}/${artifactScan.totalRoots} files=${artifactScan.scannedFiles} matches=${artifactScan.filesWithPairingMaterial}.\n`
      );
    }
    if (artifactScanError !== undefined) {
      const stage =
        artifactScanError instanceof PairingArtifactScanFailure
          ? ` at ${artifactScanError.stage}`
          : '';
      writeStderr(
        `ios-e2e: selected simulator artifact scan failed${stage}; pairing may already be active. No retry was attempted.\n`
      );
    } else if ((artifactScan?.filesWithPairingMaterial ?? 0) > 0) {
      writeStderr(
        'ios-e2e: pairing material was found in a selected-simulator artifact; pairing may already be active. No retry was attempted.\n'
      );
    }
    if (pairingFailure !== null) {
      writeStderr(`${pairingFailure}\n`);
      return 1;
    }
    if (artifactScanError !== undefined || (artifactScan?.filesWithPairingMaterial ?? 0) > 0) {
      return 1;
    }

    writeStdout('ios-e2e: simulator stored a session for this BFM.\n');
    return 0;
  } finally {
    pairingMaterials.length = 0;
    handoff.reset();
    await broker.close();
  }
}

/**
 * Opens a URL in Simulator while keeping process output out of logs and files.
 *
 * @param {string} deviceId
 * @param {string} link
 * @param {SpawnImplementation} spawnImpl
 * @returns {Promise<number>}
 */
export function runSimctlOpenURL(deviceId, link, spawnImpl = spawn) {
  return new Promise((resolveResult) => {
    /** @type {import('node:child_process').ChildProcess | undefined} */
    let child;
    let spawnFailed = false;

    /** @param {number | null} exitCode */
    const finish = (exitCode) => {
      resolveResult(exitCode ?? 1);
    };

    try {
      child = spawnImpl('xcrun', ['simctl', 'openurl', deviceId, link], {
        stdio: 'ignore',
      });
    } catch {
      finish(1);
      return;
    }

    child.once('error', () => {
      spawnFailed = true;
      finish(1);
    });
    child.once('close', (/** @type {number | null} */ exitCode) => {
      if (spawnFailed) return;
      finish(exitCode);
    });
  });
}

if (invokedDirectly) {
  process.exitCode = await runSimulatorPairing();
}
