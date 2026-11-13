#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Selects explicit whitespace-separated Maestro paths, or sorted top-level YAML
 * files from the client's .maestro directory. Shards use zero-based positions
 * modulo the shard count; explicit selection and sharding are mutually exclusive.
 * Missing discovery suites, invalid shard settings and empty selections throw.
 *
 * @param {string} clientDirectory
 * @param {{ explicitFlows?: string | undefined, shardIndex?: string | undefined, shardCount?: string | undefined }} [options]
 * @returns {string[]}
 */
export function selectFlowFiles(clientDirectory, options = {}) {
  const { explicitFlows, shardIndex, shardCount } = options;
  const hasSharding = shardIndex !== undefined || shardCount !== undefined;
  if (explicitFlows !== undefined && explicitFlows !== '') {
    if (hasSharding) throw new Error('ios-e2e explicit flow selection cannot be sharded.');
    const selected = explicitFlows.trim().split(/\s+/u).filter(Boolean);
    if (selected.length === 0) throw new Error('ios-e2e flow selection is empty.');
    return selected;
  }

  let index = 0;
  let count = 1;
  if (hasSharding) {
    if (
      shardIndex === undefined ||
      shardCount === undefined ||
      !/^\d+$/u.test(shardIndex) ||
      !/^\d+$/u.test(shardCount)
    ) {
      throw new Error('ios-e2e shard selection requires an integer index and count.');
    }
    index = Number(shardIndex);
    count = Number(shardCount);
    if (
      !Number.isSafeInteger(index) ||
      !Number.isSafeInteger(count) ||
      count <= 0 ||
      index >= count
    ) {
      throw new Error('ios-e2e shard selection is outside its valid range.');
    }
  }

  const flows = readdirSync(join(clientDirectory, '.maestro'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.yaml'))
    .map((entry) => `.maestro/${entry.name}`)
    .sort();
  if (flows.length === 0) throw new Error('ios-e2e flow suite is empty.');
  if (count > flows.length) throw new Error('ios-e2e shard count exceeds the flow count.');
  const selected = flows.filter((_, position) => position % count === index);
  if (selected.length === 0) throw new Error('ios-e2e flow selection is empty.');
  return selected;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const flows = selectFlowFiles(process.cwd(), {
      explicitFlows: process.env['POPS_E2E_FLOWS'],
      shardIndex: process.env['POPS_E2E_SHARD_INDEX'],
      shardCount: process.env['POPS_E2E_SHARD_COUNT'],
    });
    process.stdout.write(`${flows.join('\n')}\n`);
  } catch {
    process.stderr.write(
      'ios-e2e flow selection failed: check the suite and selection settings.\n'
    );
    process.exitCode = 1;
  }
}
