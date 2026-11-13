import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { selectFlowFiles } from '../ios-e2e/flow-selection.mjs';

const selectorPath = fileURLToPath(new URL('../ios-e2e/flow-selection.mjs', import.meta.url));

describe('iOS E2E flow selection', () => {
  let clientDirectory: string;
  let suiteDirectory: string;
  const flowNames = Array.from(
    { length: 13 },
    (_, index) => `flow-${String(index).padStart(2, '0')}.yaml`
  );
  const expectedFlows = flowNames.map((name) => `.maestro/${name}`);

  beforeEach(() => {
    const temporaryRoot = join(process.cwd(), 'tmp');
    mkdirSync(temporaryRoot, { recursive: true });
    clientDirectory = mkdtempSync(join(temporaryRoot, 'ios-e2e-flow-selection-'));
    suiteDirectory = join(clientDirectory, '.maestro');
    mkdirSync(suiteDirectory);
    for (const name of [...flowNames].reverse()) writeFileSync(join(suiteDirectory, name), '');
  });

  afterEach(() => {
    rmSync(clientDirectory, { recursive: true, force: true });
  });

  it('selects every local flow exactly once in deterministic path order', () => {
    expect(selectFlowFiles(clientDirectory)).toEqual(expectedFlows);
    expect(selectFlowFiles(clientDirectory, { explicitFlows: '' })).toEqual(expectedFlows);
  });

  it('partitions all thirteen flows into two nonempty disjoint shards', () => {
    const first = selectFlowFiles(clientDirectory, { shardIndex: '0', shardCount: '2' });
    const second = selectFlowFiles(clientDirectory, { shardIndex: '1', shardCount: '2' });
    expect(first).toEqual(expectedFlows.filter((_, index) => index % 2 === 0));
    expect(second).toEqual(expectedFlows.filter((_, index) => index % 2 === 1));
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    expect(first.filter((flow) => second.includes(flow))).toEqual([]);
    expect([...first, ...second].sort()).toEqual(expectedFlows);
    expect(new Set([...first, ...second]).size).toBe(expectedFlows.length);
  });

  it('includes added flows automatically and sorts before partitioning', () => {
    writeFileSync(join(suiteDirectory, 'a-new-flow.yaml'), '');
    const expanded = ['.maestro/a-new-flow.yaml', ...expectedFlows];
    const first = selectFlowFiles(clientDirectory, { shardIndex: '0', shardCount: '2' });
    const second = selectFlowFiles(clientDirectory, { shardIndex: '1', shardCount: '2' });
    expect(selectFlowFiles(clientDirectory)).toEqual(expanded);
    expect(first).toEqual(expanded.filter((_, index) => index % 2 === 0));
    expect(second).toEqual(expanded.filter((_, index) => index % 2 === 1));
    expect([...first, ...second].sort()).toEqual(expanded);
  });

  it('excludes nested flows, acceptance flows, non-YAML files and YAML directories', () => {
    for (const directory of ['acceptance', 'subflows', 'directory.yaml']) {
      mkdirSync(join(suiteDirectory, directory));
      writeFileSync(join(suiteDirectory, directory, 'nested.yaml'), '');
    }
    for (const name of ['README.md', 'other.yml', 'other.yaml.bak']) {
      writeFileSync(join(suiteDirectory, name), '');
    }
    expect(selectFlowFiles(clientDirectory)).toEqual(expectedFlows);
  });

  it('preserves explicit acceptance paths and order with whitespace splitting', () => {
    expect(
      selectFlowFiles(clientDirectory, {
        explicitFlows: '  .maestro/acceptance/inventory.yaml\n\t.maestro/flow-01.yaml  ',
      })
    ).toEqual(['.maestro/acceptance/inventory.yaml', '.maestro/flow-01.yaml']);
  });

  it('allows explicit selection without a default suite', () => {
    rmSync(suiteDirectory, { recursive: true });
    expect(
      selectFlowFiles(clientDirectory, { explicitFlows: '.maestro/acceptance/inventory.yaml' })
    ).toEqual(['.maestro/acceptance/inventory.yaml']);
  });

  it('rejects whitespace-only explicit selection', () => {
    expect(() => selectFlowFiles(clientDirectory, { explicitFlows: ' \n\t ' })).toThrow();
  });

  it.each([
    { shardIndex: '0' },
    { shardCount: '2' },
    { shardIndex: '0', shardCount: '2' },
    { shardIndex: '' },
    { shardCount: '' },
  ])('rejects explicit paths combined with any shard setting: %j', (sharding) => {
    expect(() =>
      selectFlowFiles(clientDirectory, {
        explicitFlows: '.maestro/acceptance/inventory.yaml',
        ...sharding,
      })
    ).toThrow();
  });

  it.each([
    { shardIndex: '0' },
    { shardCount: '2' },
    { shardIndex: '', shardCount: '2' },
    { shardIndex: '0', shardCount: '' },
    { shardIndex: '0', shardCount: '0' },
    { shardIndex: '2', shardCount: '2' },
    { shardIndex: '3', shardCount: '2' },
    { shardIndex: '-1', shardCount: '2' },
    { shardIndex: '0', shardCount: '-2' },
    { shardIndex: '0.5', shardCount: '2' },
    { shardIndex: '0', shardCount: '2.5' },
    { shardIndex: 'NaN', shardCount: '2' },
    { shardIndex: '0', shardCount: 'Infinity' },
    { shardIndex: 'Infinity', shardCount: '2' },
    { shardIndex: '0', shardCount: 'NaN' },
    { shardIndex: '9007199254740992', shardCount: '9007199254740993' },
    { shardIndex: '0', shardCount: '9007199254740992' },
    { shardIndex: '0', shardCount: '14' },
    { shardIndex: '13', shardCount: '14' },
    { shardIndex: ' 0', shardCount: '2' },
    { shardIndex: '0', shardCount: '2 ' },
    { shardIndex: '1e0', shardCount: '2' },
    { shardIndex: '0x0', shardCount: '2' },
    { shardIndex: '+0', shardCount: '2' },
  ])('rejects invalid or empty shard configuration: %j', (options) => {
    expect(() => selectFlowFiles(clientDirectory, options)).toThrow();
  });

  it('accepts a single shard and one flow per shard at the count boundary', () => {
    expect(selectFlowFiles(clientDirectory, { shardIndex: '0', shardCount: '1' })).toEqual(
      expectedFlows
    );
    for (const [index, flow] of expectedFlows.entries()) {
      expect(
        selectFlowFiles(clientDirectory, {
          shardIndex: String(index),
          shardCount: String(expectedFlows.length),
        })
      ).toEqual([flow]);
    }
  });

  it.each([{}, { shardIndex: '0', shardCount: '2' }])('rejects a missing suite: %j', (options) => {
    rmSync(suiteDirectory, { recursive: true });
    expect(() => selectFlowFiles(clientDirectory, options)).toThrow();
  });

  it.each([{}, { shardIndex: '0', shardCount: '2' }])('rejects an empty suite: %j', (options) => {
    rmSync(suiteDirectory, { recursive: true });
    mkdirSync(suiteDirectory);
    expect(() => selectFlowFiles(clientDirectory, options)).toThrow();
  });

  it('reads shard environment settings from the client working directory when invoked directly', () => {
    const result = spawnSync(process.execPath, [selectorPath], {
      cwd: clientDirectory,
      env: {
        PATH: process.env['PATH'],
        POPS_E2E_SHARD_INDEX: '1',
        POPS_E2E_SHARD_COUNT: '2',
      },
      encoding: 'utf8',
      timeout: 5_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(
      `${expectedFlows.filter((_, index) => index % 2 === 1).join('\n')}\n`
    );
  }, 10_000);

  it('reads explicit acceptance paths from the environment without sharding', () => {
    const result = spawnSync(process.execPath, [selectorPath], {
      cwd: clientDirectory,
      env: {
        PATH: process.env['PATH'],
        POPS_E2E_FLOWS: '.maestro/acceptance/inventory.yaml .maestro/flow-01.yaml',
      },
      encoding: 'utf8',
      timeout: 5_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('.maestro/acceptance/inventory.yaml\n.maestro/flow-01.yaml\n');
  }, 10_000);

  it.each([
    { POPS_E2E_SHARD_INDEX: 'invalid-private-fixture' },
    { POPS_E2E_SHARD_COUNT: 'invalid-private-fixture' },
    { POPS_E2E_SHARD_INDEX: 'invalid-private-fixture', POPS_E2E_SHARD_COUNT: '2' },
    { POPS_E2E_SHARD_INDEX: '0', POPS_E2E_SHARD_COUNT: 'invalid-private-fixture' },
  ])(
    'fails directly invoked invalid environment settings without echoing supplied values: %j',
    (selectionEnvironment) => {
      const result = spawnSync(process.execPath, [selectorPath], {
        cwd: clientDirectory,
        env: { PATH: process.env['PATH'], ...selectionEnvironment },
        encoding: 'utf8',
        timeout: 5_000,
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe(
        'ios-e2e flow selection failed: check the suite and selection settings.\n'
      );
      expect(result.stderr).not.toContain('invalid-private-fixture');
    },
    10_000
  );
});
