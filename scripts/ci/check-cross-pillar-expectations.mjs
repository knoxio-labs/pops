#!/usr/bin/env node
/**
 * Backend cross-pillar expectation guard.
 *
 * A pillar's SERVER calls a sibling through the `@pops/pillar-sdk` proxy,
 * which is typed by the CALLER: `pillar<TRouter>('finance')` accepts
 * whatever router type the consumer declares, and resolves the call at
 * runtime by matching the property chain against an `operationId` in the
 * producer's published OpenAPI. Nothing checks the two agree. A producer
 * that renames an operation, moves a path, or renames a parameter breaks
 * the consumer silently, at runtime, in production.
 *
 * The frontend equivalent of this seam is gated by regenerating a client
 * and diffing it (`cross-pillar-clients` in quality.yml). There is no
 * codegen on the backend side to diff, so this guard asserts the narrow
 * thing the consumer actually depends on instead: that the operation still
 * exists, at the path and method expected, carrying the query parameters
 * the consumer sends and the path parameters it substitutes.
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
 * @property {string[]} [pathParams] Path parameters the consumer fills in.
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
  {
    consumer: 'purchases',
    producer: 'inventory',
    operationId: 'items.get',
    path: '/items/{id}',
    method: 'get',
    query: [],
    pathParams: ['id'],
    usedBy: 'pillars/purchases/src/api/cron/pillar-lookup.ts',
  },
  {
    consumer: 'purchases',
    producer: 'documents',
    operationId: 'paperless.get',
    path: '/paperless/documents/{id}',
    method: 'get',
    query: [],
    pathParams: ['id'],
    usedBy: 'pillars/purchases/src/api/cron/pillar-lookup.ts',
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

  for (const name of expectation.query) {
    if (!declaredParams(found.operation, 'query').has(name)) {
      failures.push(
        `${expectation.operationId} no longer declares query parameter '${name}', which ` +
          `${expectation.consumer} sends`
      );
    }
  }

  // A renamed path parameter is the quietest break of the lot: the SDK
  // substitutes `{name}` from the input keys, so a producer renaming `:id`
  // to `:itemId` leaves the literal placeholder in the URL and the consumer
  // reads the resulting 404 as a real answer.
  for (const name of expectation.pathParams ?? []) {
    if (!declaredParams(found.operation, 'path').has(name)) {
      failures.push(
        `${expectation.operationId} no longer declares path parameter '${name}', which ` +
          `${expectation.consumer} substitutes into the URL`
      );
    }
  }

  return failures;
}

/**
 * Names of an operation's declared parameters in one location.
 *
 * @param {Record<string, unknown>} operation
 * @param {'query' | 'path'} location
 * @returns {Set<string>}
 */
function declaredParams(operation, location) {
  return new Set(
    (Array.isArray(operation['parameters']) ? operation['parameters'] : [])
      .filter((p) => isRecord(p) && p['in'] === location)
      .map((p) => String(isRecord(p) ? p['name'] : ''))
  );
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

  const withPathParam = {
    consumer: 'c',
    producer: 'p',
    operationId: 'items.get',
    path: '/items/{id}',
    method: 'get',
    query: [],
    pathParams: ['id'],
    usedBy: 'nowhere',
  };
  const renamedPathParam = {
    paths: {
      '/items/{id}': {
        get: { operationId: 'items.get', parameters: [{ name: 'itemId', in: 'path' }] },
      },
    },
  };
  assert(
    checkExpectation(withPathParam, renamedPathParam).some((f) =>
      f.includes("path parameter 'id'")
    ),
    'a renamed path parameter must fail'
  );

  const intactPathParam = {
    paths: {
      '/items/{id}': {
        get: { operationId: 'items.get', parameters: [{ name: 'id', in: 'path' }] },
      },
    },
  };
  assert(
    checkExpectation(withPathParam, intactPathParam).length === 0,
    'a matching path parameter must pass'
  );

  console.log(
    'self-test OK — flags a renamed operation, a moved path, a dropped query parameter, a renamed path parameter.'
  );
}

function assert(condition, message) {
  if (!condition) {
    console.error(`self-test FAILED: ${message}`);
    process.exit(1);
  }
}

if (process.argv.includes('--self-test')) selfTest();
else run();
