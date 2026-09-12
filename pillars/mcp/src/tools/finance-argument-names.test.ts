/**
 * Guards against a finance MCP tool advertising an input name the finance
 * pillar's REST contract does not accept for the operation the tool's
 * handler actually calls (POPS-3579).
 *
 * The two existing sync tests (`finance-transaction-type.test.ts`,
 * `finance-budget-period.test.ts`) only pin closed ENUM vocabularies. Nothing
 * checked that an advertised ARGUMENT NAME — `account` on
 * `finance.transactions.list`, say — is one the pillar's query/path/body
 * schema still has a matching key for. `performRestCall` in
 * `libs/sdk/src/client/rest-call.ts` builds a request from only the input
 * keys the OpenAPI-derived route declares as `query`/`path` params (or, for
 * a body operation, forwards the input as the JSON body); anything else is
 * silently dropped, never a wire error, so a stale name just makes the
 * filter a no-op.
 *
 * `ROUTES` below names, for every finance()-backed tool in `financeTools`,
 * the REST operation its handler calls and — where the handler translates a
 * friendlier MCP-facing name before the call (`includeArchived` -> the
 * wire's `archived`, `accountId` -> the wire's path `id`) — the rename that
 * makes that translation explicit. `finance.entities.list` calls the
 * CONTACTS pillar, not finance, so it is out of this guard's scope (contacts
 * has its own contract and its own openapi projection). `finance.search`'s
 * two arguments (`text`, `filters`) are wrapped into a single nested `query`
 * object before the call, so it is checked separately against the same
 * spec, drilling into the nested schema.
 *
 * If this test fails, either the tool's `inputSchema` advertises a name the
 * pillar's `GET`/`POST` route does not declare (fix the tool, not the spec),
 * or the finance pillar renamed/removed a param and the tool + its `ROUTES`
 * entry both need updating.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { financeTools } from './finance.js';

const here = dirname(fileURLToPath(import.meta.url));
const FINANCE_OPENAPI_PATH = join(here, '../../../finance/openapi/finance.openapi.json');
const spec: unknown = JSON.parse(readFileSync(FINANCE_OPENAPI_PATH, 'utf8'));

function prop(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`expected an object while reading "${key}", got ${typeof value}`);
  }
  return (value as Record<string, unknown>)[key];
}

function drill(value: unknown, ...keys: string[]): unknown {
  return keys.reduce(prop, value);
}

interface RouteExpectation {
  /** The MCP tool name, as declared in its `ToolDef`. */
  toolName: string;
  /** The OpenAPI path template the tool's handler ultimately calls. */
  path: string;
  method: 'get' | 'post';
  /**
   * Declared `inputSchema` property name -> the wire name it actually
   * becomes before reaching finance, for the handful of tools that
   * translate a friendlier MCP-facing name. Absent entries are assumed
   * identity (the schema name IS the wire name).
   */
  rename?: Record<string, string>;
  /**
   * For a body operation whose accepted fields sit inside a nested object
   * rather than at the body's top level (`finance.search`'s `{ query: {
   * text, filters } }`), the property path locating that nested object.
   */
  bodyPath?: string[];
}

const ROUTES: readonly RouteExpectation[] = [
  { toolName: 'finance.transactions.list', path: '/transactions', method: 'get' },
  { toolName: 'finance.transactions.get', path: '/transactions/{id}', method: 'get' },
  { toolName: 'finance.budgets.list', path: '/budgets', method: 'get' },
  { toolName: 'finance.budgets.get', path: '/budgets/{id}', method: 'get' },
  {
    toolName: 'finance.accounts.list',
    path: '/accounts',
    method: 'get',
    rename: { includeArchived: 'archived' },
  },
  {
    toolName: 'finance.accounts.checkpoints',
    path: '/accounts/{id}/checkpoints',
    method: 'get',
    rename: { accountId: 'id' },
  },
  { toolName: 'finance.corrections.list', path: '/corrections', method: 'get' },
  { toolName: 'finance.tagRules.vocabulary', path: '/tag-rules/vocabulary', method: 'get' },
  { toolName: 'finance.wishlist.list', path: '/wishlist', method: 'get' },
  { toolName: 'finance.wishlist.get', path: '/wishlist/{id}', method: 'get' },
  { toolName: 'finance.imports.getImportProgress', path: '/imports/progress', method: 'get' },
  { toolName: 'finance.search', path: '/search', method: 'post', bodyPath: ['query'] },
];

/** `finance.entities.list` calls contacts, not finance — nothing here checks it. */
const OUT_OF_SCOPE_TOOL_NAMES = new Set(['finance.entities.list']);

function queryAndPathParamNames(path: string, method: 'get' | 'post'): string[] {
  const operation = drill(spec, 'paths', path, method);
  const parameters = drill(operation, 'parameters');
  if (!Array.isArray(parameters)) return [];
  return parameters
    .filter(
      (p): p is Record<string, unknown> =>
        typeof p === 'object' &&
        p !== null &&
        ((p as Record<string, unknown>)['in'] === 'query' ||
          (p as Record<string, unknown>)['in'] === 'path')
    )
    .map((p) => p['name'])
    .filter((name): name is string => typeof name === 'string');
}

function bodyPropertyNames(path: string, method: 'get' | 'post', bodyPath: string[]): string[] {
  const schema = drill(
    spec,
    'paths',
    path,
    method,
    'requestBody',
    'content',
    'application/json',
    'schema'
  );
  const nested = bodyPath.reduce<unknown>((acc, key) => drill(acc, 'properties', key), schema);
  const properties = drill(nested, 'properties');
  if (typeof properties !== 'object' || properties === null) {
    throw new Error(`expected a properties object at ${path} ${method} body.${bodyPath.join('.')}`);
  }
  return Object.keys(properties);
}

function acceptedNamesFor(route: RouteExpectation): string[] {
  return route.bodyPath
    ? bodyPropertyNames(route.path, route.method, route.bodyPath)
    : queryAndPathParamNames(route.path, route.method);
}

describe('finance MCP tools advertise only argument names finance actually reads', () => {
  it('every ROUTES entry is present in financeTools', () => {
    const declaredNames = new Set(financeTools.map((t) => t.name));
    for (const route of ROUTES) {
      expect(declaredNames.has(route.toolName), `${route.toolName} not found in financeTools`).toBe(
        true
      );
    }
  });

  it('every finance()-backed tool is covered by ROUTES or explicitly out of scope', () => {
    const covered = new Set([...ROUTES.map((r) => r.toolName), ...OUT_OF_SCOPE_TOOL_NAMES]);
    for (const tool of financeTools) {
      expect(covered.has(tool.name), `${tool.name} is not covered by this guard`).toBe(true);
    }
  });

  it.each(ROUTES)(
    '$toolName only declares argument names $path ($method) actually accepts',
    (route) => {
      const tool = financeTools.find((t) => t.name === route.toolName);
      if (!tool) throw new Error(`tool ${route.toolName} not found in financeTools`);
      const declared = Object.keys(tool.inputSchema.properties ?? {});
      const accepted = acceptedNamesFor(route);
      for (const name of declared) {
        const wireName = route.rename?.[name] ?? name;
        expect(
          accepted,
          `${route.toolName}'s "${name}" forwards as "${wireName}", which ${route.path} (${route.method.toUpperCase()}) does not accept`
        ).toContain(wireName);
      }
    }
  );
});
