#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSimulatorIdentifier } from './simulator-pairing.mjs';

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Resolves one explicitly selected disposable simulator from `simctl` output.
 * A simulator is disposable only when its name starts with `POPS-` and marks
 * the device as `disposable`.
 *
 * @param {string | undefined} deviceId
 * @param {unknown} simulatorList
 * @returns {{ deviceId: string, name: string }}
 */
export function resolveDisposableSimulator(deviceId, simulatorList) {
  if (typeof deviceId !== 'string' || !isSimulatorIdentifier(deviceId)) {
    throw new Error('ios-e2e requires an explicit disposable simulator UDID.');
  }
  if (!isRecord(simulatorList) || !isRecord(simulatorList['devices'])) {
    throw new Error('ios-e2e could not read available simulators.');
  }

  const matches = Object.values(simulatorList['devices']).flatMap((devices) =>
    Array.isArray(devices)
      ? devices.filter((device) => isRecord(device) && device['udid'] === deviceId)
      : []
  );
  if (matches.length !== 1) throw new Error('ios-e2e selected simulator is not available.');

  const name = matches[0]?.['name'];
  if (
    typeof name !== 'string' ||
    !name.startsWith('POPS-') ||
    !/(?:^|[\s-])disposable(?:$|[\s-])/iu.test(name)
  ) {
    throw new Error('ios-e2e selected simulator is not marked disposable.');
  }

  return { deviceId, name };
}

/**
 * Confirms that both E2E endpoints are loopback HTTP origins before Maestro can
 * reach a pairing control endpoint.
 *
 * @param {string} bfmBaseUrl
 * @param {string} controlUrl
 * @returns {boolean}
 */
export function hasLocalHarnessOrigins(bfmBaseUrl, controlUrl) {
  return [bfmBaseUrl, controlUrl].every((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'http:' &&
        url.hostname === '127.0.0.1' &&
        url.username === '' &&
        url.password === '' &&
        url.pathname === '/' &&
        url.search === '' &&
        url.hash === ''
      );
    } catch {
      return false;
    }
  });
}

/**
 * Reads the selected available simulator without selecting a device by name.
 *
 * @param {string | undefined} deviceId
 * @param {() => string} [readList]
 * @returns {{ deviceId: string, name: string }}
 */
export function readDisposableSimulator(
  deviceId,
  readList = () =>
    execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], {
      encoding: 'utf8',
    })
) {
  if (typeof deviceId !== 'string' || !isSimulatorIdentifier(deviceId)) {
    throw new Error('ios-e2e requires an explicit disposable simulator UDID.');
  }

  let output;
  try {
    output = readList();
  } catch {
    throw new Error('ios-e2e could not read available simulators.');
  }

  /** @type {unknown} */
  let simulatorList;
  try {
    simulatorList = JSON.parse(output);
  } catch {
    throw new Error('ios-e2e could not read available simulators.');
  }
  return resolveDisposableSimulator(deviceId, simulatorList);
}

if (invokedDirectly) {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === '--verify-local-origins') {
    if (args.length !== 2 || !hasLocalHarnessOrigins(args[0] ?? '', args[1] ?? '')) {
      process.stderr.write('e2e: BFM and control plane must use loopback HTTP origins.\n');
      process.exitCode = 1;
    }
  } else {
    try {
      const target = readDisposableSimulator(mode ?? process.env['POPS_IOS_E2E_SIMULATOR_UDID']);
      process.stdout.write(`${target.deviceId}\n`);
    } catch (error) {
      process.stderr.write(
        `${error instanceof Error ? error.message : 'ios-e2e simulator selection failed.'}\n`
      );
      process.exitCode = 1;
    }
  }
}
