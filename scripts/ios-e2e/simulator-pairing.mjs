#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatPairingMcpFailure, issuePairingCodeViaMcp } from './mcp-pairing-code.mjs';

/** @typedef {(command: string, args: string[], options: import('node:child_process').SpawnOptions) => import('node:child_process').ChildProcess} SpawnImplementation */

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

/**
 * Wraps a BFM pairing link in the simulator-only native URL scheme.
 *
 * @param {string} pairingUrl
 * @returns {string}
 */
export function simulatorPairingURL(pairingUrl) {
  const url = new URL('pops://e2e-pairing');
  url.searchParams.set('pairing', pairingUrl);
  return url.href;
}

/**
 * Removes the pairing values that may appear in `simctl` diagnostics.
 *
 * @param {string} output
 * @param {string[]} secrets
 * @returns {string}
 */
export function redactPairingOutput(output, secrets) {
  return secrets
    .toSorted((left, right) => right.length - left.length)
    .reduce((redacted, secret) => {
      if (secret.length === 0) return redacted;
      return [secret, encodeURIComponent(secret)].reduce(
        (value, variant) => value.split(variant).join('[redacted]'),
        redacted
      );
    }, output);
}

/**
 * Requests one code through MCP and opens its pairing link in an installed app.
 * The code and URL stay in process memory and a transient `simctl` argument;
 * command output is captured, redacted, and never forwarded or written.
 *
 * @param {{
 *   endpoint: string,
 *   token?: string,
 *   deviceId: string,
 *   fetchImpl?: typeof fetch,
 *   spawnImpl?: SpawnImplementation
 * }} options
 * @returns {Promise<number>}
 */
export async function issueAndOpenPairingLink({
  endpoint,
  token,
  deviceId,
  fetchImpl = fetch,
  spawnImpl = spawn,
}) {
  if (!/^[A-Fa-f0-9-]{36}$/u.test(deviceId)) return 1;

  const pairing = await issuePairingCodeViaMcp({ endpoint, token, fetchImpl });
  const link = simulatorPairingURL(pairing.pairingUrl);
  return runSimctlOpenURL(deviceId, link, [pairing.code, pairing.pairingUrl, link], spawnImpl);
}

/**
 * Validates the command inputs, issues one simulator pairing link, and writes only a fixed status.
 *
 * @param {{
 *   endpoint?: string,
 *   token?: string,
 *   deviceId?: string,
 *   issuePairingLink?: (options: { endpoint: string, token?: string, deviceId: string }) => Promise<number>,
 *   writeStdout?: (message: string) => void,
 *   writeStderr?: (message: string) => void
 * }} options
 * @returns {Promise<number>}
 */
export async function runSimulatorPairing({
  endpoint = process.env['POPS_MCP_URL']?.trim(),
  token = process.env['MCP_INBOUND_TOKEN'],
  deviceId = process.env['POPS_IOS_SIMULATOR_UDID']?.trim(),
  issuePairingLink = issueAndOpenPairingLink,
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

  if (!/^[A-Fa-f0-9-]{36}$/u.test(deviceId)) {
    writeStderr('ios-e2e: selected simulator ID is invalid; no pairing request was sent.\n');
    return 1;
  }

  try {
    const exitCode = await issuePairingLink({ endpoint, token, deviceId });
    if (exitCode === 0) {
      writeStdout('ios-e2e: native simulator pairing link delivered.\n');
    } else {
      writeStderr(
        `ios-e2e: pairing code was issued, but simulator link delivery failed (exit ${exitCode}).\n`
      );
    }
    return exitCode;
  } catch (error) {
    writeStderr(`${formatPairingMcpFailure(error)}\n`);
    return 1;
  }
}

/**
 * Opens a URL in Simulator while keeping process output out of logs and files.
 *
 * @param {string} deviceId
 * @param {string} link
 * @param {string[]} secrets
 * @param {SpawnImplementation} spawnImpl
 * @returns {Promise<number>}
 */
export function runSimctlOpenURL(deviceId, link, secrets, spawnImpl = spawn) {
  return new Promise((resolveResult) => {
    /** @type {import('node:child_process').ChildProcess | undefined} */
    let child;
    let stdout = '';
    let stderr = '';
    let spawnFailed = false;

    /** @param {number | null} exitCode */
    const finish = (exitCode) => {
      const redactedOutput = redactPairingOutput(`${stdout}\n${stderr}`, secrets);
      void redactedOutput;
      resolveResult(exitCode ?? 1);
    };

    try {
      child = spawnImpl('xcrun', ['simctl', 'openurl', deviceId, link], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      finish(1);
      return;
    }

    /**
     * @param {string} current
     * @param {Buffer | string} chunk
     * @returns {string}
     */
    const capture = (current, chunk) => {
      const remaining = 65_536 - Buffer.byteLength(current);
      if (remaining <= 0) return current;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      return current + bytes.subarray(0, remaining).toString('utf8');
    };

    child.stdout?.on('data', (/** @type {Buffer | string} */ chunk) => {
      stdout = capture(stdout, chunk);
    });
    child.stderr?.on('data', (/** @type {Buffer | string} */ chunk) => {
      stderr = capture(stderr, chunk);
    });
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
