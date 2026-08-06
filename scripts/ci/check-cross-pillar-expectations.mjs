#!/usr/bin/env node
/**
 * Backend cross-pillar expectation guard.
 *
 * A pillar's SERVER calls a sibling through the `@pops/pillar-sdk` proxy,
 * which is typed by the CALLER: `pillar<TRouter>('finance')` accepts
 * whatever router type the consumer declares, and resolves the call at
 * runtime by matching the property chain against an `operationId` in the
 * producer's published OpenAPI. Nothing checks the two agree. A producer
 * that renames an operation, moves a path, or drops a query parameter
 * breaks the consumer silently, at runtime, in production.
 *
 * The frontend equivalent of this seam is gated by regenerating a client
 * and diffing it (`cross-pillar-clients` in quality.yml). There is no
 * codegen on the backend side to diff, so this guard asserts the narrow
 * thing the consumer actually depends on instead: that the operation still
 * exists, at the path and method expected, carrying the query parameters
 * the consumer sends.
 *
 * Deliberately NOT a vendored copy of the producer's whole spec. Finance's
 * document is 17k lines describing its entire API; vendoring it to pin one
 * operation would mean a change to any unrelated finance route failing this
 * consumer's drift check, which is the kind of noise that teaches people to
 * re-vendor without reading.
 *
 * Usage:
 *   node scripts/ci/check-cross-pillar-expectations.mjs
 *   node scripts/ci/check-cross-pillar-expectations.mjs --self-test
 *
 * Exit 0 = every expectation holds. Exit 1 = a producer contract moved.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/**
 * @typedef {object} Expectation
 * @property {string} consumer   Pillar whose server makes the call.
 * @property {string} producer   Pillar that publishes the contract.
 * @property {string} operationId The SDK resolves a property chain to this.
 * @property {string} path       Expected path in the producer's OpenAPI.
 * @property {string} method     Expected HTTP method, lowercase.
 * @property {string[]} query    Query parameters the consumer sends.
 * @property {string} usedBy     Where the consumer's call lives.
 */

/**
 * Every backend-to-backend expectation in the fleet.
 *
 * Add a row when a pillar's server starts calling another's REST API. The
 * row is the machine-checkable half of what the consumer's local router
 * type claims.
 */
export const EXPECTATIONS = [
  {
    consumer: 'purchases',
    producer: 'finance',
    operationId: 'transactions.list',
    path: '/transactions',
    method: 'get',
    query: ['startDate', 'endDate', 'search', 'limit', 'offset'],
    usedBy: 'pillars/purchases/src/api/finance/client.ts',
  },
];

/**
 * Check one expectation against a producer's OpenAPI document.
 *
 * @param {Expectation} expectation
 * @param {unknown} doc Parsed OpenAPI document.
 * @returns {string[]} Human-readable failures; empty when it holds.
 */
export function checkExpectation(expectation, doc) {
  /** @type {string[]} */
  const failures = [];
  const paths = isRecord(doc) && isRecord(doc['paths']) ? doc['paths'] : null;
  if (!paths) {
    return [`${expectation.producer}: OpenAPI document has no paths object`];
  }

  let found = null;
  for (const [path, operations] of Object.entries(paths)) {
    if (!isRecord(operations)) continue;
    for (const [method, operation] of Object.entries(operations)) {
      if (isRecord(operation) && operation['operationId'] === expectation.operationId) {
        found = { path, method, operation };
      }
    }
  }

  if (!found) {
    return [
      `${expectation.producer} no longer declares operationId '${expectation.operationId}'. ` +
        `${expectation.consumer} resolves its call by that id (${expectation.usedBy}), so this ` +
        `is a silent runtime break.`,
    ];
  }

  if (found.path !== expectation.path || found.method !== expectation.method) {
    failures.push(
      `${expectation.operationId} moved to ${found.method.toUpperCase()} ${found.path}, ` +
        `expected ${expectation.method.toUpperCase()} ${expectation.path}`
    );
  }

  const declared = new Set(
    (Array.isArray(found.operation['parameters']) ? found.operation['parameters'] : [])
      .filter((p) => isRecord(p) && p['in'] === 'query')
      .map((p) => String(isRecord(p) ? p['name'] : ''))
  );
  for (const name of expectation.query) {
    if (!declared.has(name)) {
      failures.push(
        `${expectation.operationId} no longer declares query parameter '${name}', which ` +
          `${expectation.consumer} sends`
      );
    }
  }

  return failures;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function producerSpecPath(producer) {
  return join(repoRoot, 'pillars', producer, 'openapi', `${producer}.openapi.json`);
}

function run() {
  /** @type {string[]} */
  const failures = [];

  for (const expectation of EXPECTATIONS) {
    const specPath = producerSpecPath(expectation.producer);
    if (!existsSync(specPath)) {
      failures.push(`${expectation.producer}: no published OpenAPI at ${specPath}`);
      continue;
    }
    let doc;
    try {
      doc = JSON.parse(readFileSync(specPath, 'utf8'));
    } catch (cause) {
      failures.push(`${expectation.producer}: OpenAPI is not valid JSON (${String(cause)})`);
      continue;
    }
    failures.push(...checkExpectation(expectation, doc));
  }

  if (failures.length > 0) {
    console.error('Backend cross-pillar expectation(s) broken:\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(
      '\nUpdate the consumer to match, then update EXPECTATIONS in this script.\n' +
        'Do NOT silence this: the SDK proxy is untyped at the network edge, so nothing\n' +
        'else fails until the call runs in production.'
    );
    process.exit(1);
  }

  console.log(`OK — ${String(EXPECTATIONS.length)} backend cross-pillar expectation(s) hold.`);
}

function selfTest() {
  const expectation = EXPECTATIONS[0];
  const good = {
    paths: {
      '/transactions': {
        get: {
          operationId: 'transactions.list',
          parameters: expectation.query.map((name) => ({ name, in: 'query' })),
        },
      },
    },
  };
  assert(checkExpectation(expectation, good).length === 0, 'a matching document must pass');

  const renamed = { paths: { '/transactions': { get: { operationId: 'transactions.query' } } } };
  assert(checkExpectation(expectation, renamed).length === 1, 'a renamed operation must fail');

  const moved = {
    paths: {
      '/txns': {
        get: {
          operationId: 'transactions.list',
          parameters: expectation.query.map((name) => ({ name, in: 'query' })),
        },
      },
    },
  };
  assert(
    checkExpectation(expectation, moved).some((f) => f.includes('moved')),
    'a moved path must fail'
  );

  const missingParam = {
    paths: {
      '/transactions': {
        get: {
          operationId: 'transactions.list',
          parameters: [{ name: 'startDate', in: 'query' }],
        },
      },
    },
  };
  assert(
    checkExpectation(expectation, missingParam).some((f) => f.includes('endDate')),
    'a dropped query parameter must fail'
  );

  console.log('self-test OK — flags a renamed operation, a moved path, a dropped parameter.');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`self-test FAILED: ${message}`);
    process.exit(1);
  }
}

if (process.argv.includes('--self-test')) selfTest();
else run();
