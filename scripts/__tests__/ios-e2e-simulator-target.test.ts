import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  hasLocalHarnessOrigins,
  readDisposableSimulator,
  resolveDisposableSimulator,
} from '../ios-e2e/simulator-target.mjs';

const rootRunPath = fileURLToPath(new URL('../ios-e2e/run.mjs', import.meta.url));
const iosTaskPath = fileURLToPath(new URL('../../clients/ios/mise.toml', import.meta.url));
const selectedId = '7E817985-CBB4-4466-86C4-B0CE0D1DF50E';
const simulatorList = {
  devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-27-0': [
      { name: 'iPhone 17', udid: 'F4EF06D4-FD8B-452A-B460-199993ABDCF1', state: 'Booted' },
      { name: 'POPS-5855 disposable', udid: selectedId, state: 'Shutdown' },
    ],
  },
};

describe('E2E simulator target', () => {
  it('selects only the exact disposable simulator ID', () => {
    expect(resolveDisposableSimulator(selectedId, simulatorList)).toEqual({
      deviceId: selectedId,
      name: 'POPS-5855 disposable',
    });
  });

  it('reads the selected device ID without looking up a shared simulator name', () => {
    const target = readDisposableSimulator(selectedId, () => JSON.stringify(simulatorList));
    expect(target.deviceId).toBe(selectedId);
  });

  it.each([
    [undefined, simulatorList, 'ios-e2e requires an explicit disposable simulator UDID.'],
    ['not-a-udid', simulatorList, 'ios-e2e requires an explicit disposable simulator UDID.'],
    [
      'F4EF06D4-FD8B-452A-B460-199993ABDCF1',
      simulatorList,
      'ios-e2e selected simulator is not marked disposable.',
    ],
    [
      'A4EF06D4-FD8B-452A-B460-199993ABDCF1',
      simulatorList,
      'ios-e2e selected simulator is not available.',
    ],
    [selectedId, { devices: [] }, 'ios-e2e could not read available simulators.'],
  ])('rejects unsafe or malformed selection', (deviceId, devices, message) => {
    expect(() => resolveDisposableSimulator(deviceId, devices)).toThrow(message);
  });

  it('rejects the missing target before invoking simctl', () => {
    let listed = false;
    expect(() =>
      readDisposableSimulator(undefined, () => {
        listed = true;
        return JSON.stringify(simulatorList);
      })
    ).toThrow('ios-e2e requires an explicit disposable simulator UDID.');
    expect(listed).toBe(false);
  });

  it('requires loopback origins for the BFM and control plane', () => {
    expect(hasLocalHarnessOrigins('http://127.0.0.1:3000', 'http://127.0.0.1:3001')).toBe(true);
    expect(hasLocalHarnessOrigins('https://bfm.example.test', 'http://127.0.0.1:3001')).toBe(false);
    expect(hasLocalHarnessOrigins('http://127.0.0.1:3000', 'http://localhost:3001')).toBe(false);
  });

  it('checks the target before the root harness allocates state or starts a server', async () => {
    const source = await readFile(rootRunPath, 'utf8');
    const main = source.slice(source.indexOf('async function main()'));
    expect(main.indexOf('readDisposableSimulator(')).toBeGreaterThanOrEqual(0);
    expect(main.indexOf('readDisposableSimulator(')).toBeLessThan(main.indexOf('allocatePort()'));
    expect(main.indexOf('readDisposableSimulator(')).toBeLessThan(main.indexOf('mkdtempSync('));
    expect(source).toContain("const HOST = '127.0.0.1'");
    expect(source).toContain("NODE_ENV: 'test'");
  });

  it('checks the target and local endpoints before the client task installs or drives the app', async () => {
    const source = await readFile(iosTaskPath, 'utf8');
    const task = source.slice(source.indexOf('[tasks.e2e]'));
    expect(task.indexOf('simulator-target.mjs')).toBeGreaterThanOrEqual(0);
    expect(task.indexOf('simulator-target.mjs')).toBeLessThan(task.indexOf('xcrun simctl install'));
    expect(task.indexOf('simulator-target.mjs')).toBeLessThan(task.indexOf('maestro --device'));
  });

  it('requires an explicit disposable target for the standalone pairing task', async () => {
    const source = await readFile(iosTaskPath, 'utf8');
    const task = source.slice(source.indexOf('[tasks."e2e:pair:mcp"]'));
    expect(task).toContain('simulator-target.mjs');
    expect(task).toContain('POPS_IOS_E2E_SIMULATOR_UDID');
    expect(task.indexOf('simulator-target.mjs')).toBeLessThan(task.indexOf('simctl bootstatus'));
    expect(task.indexOf('simulator-target.mjs')).toBeLessThan(
      task.indexOf('scripts/with-simulator-lock.sh')
    );
    expect(task.indexOf('scripts/with-simulator-lock.sh')).toBeLessThan(
      task.indexOf('simctl bootstatus')
    );
    expect(task).not.toContain('select(.name == $name)');
  });
});
