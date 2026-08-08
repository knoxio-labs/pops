/**
 * Guards the committed `openapi/bfm.openapi.json` projection.
 *
 * The version pin is the load-bearing assertion here: the client generators
 * downstream (including the iOS client's) target OpenAPI 3.0, so a document
 * that drifted to 3.1 would break *consumers* rather than failing this
 * pillar's own build. See AGENTS.md "The OpenAPI version pin".
 */
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { bfmContract } from '../../contract/rest.js';
import { createTestApp, type TestApp } from './harness.js';

type Operation = { operationId?: unknown };
type OpenApiBody = {
  openapi?: unknown;
  info?: { title?: unknown };
  paths?: Record<string, Record<string, Operation> | undefined>;
};

const apps: TestApp[] = [];

afterEach(() => {
  while (apps.length > 0) {
    apps.pop()?.cleanup();
  }
});

async function fetchDocument(): Promise<OpenApiBody> {
  const created = createTestApp();
  apps.push(created);
  const res = await request(created.app).get('/openapi');
  expect(res.status).toBe(200);
  return res.body as OpenApiBody;
}

/**
 * A ts-rest router's values are `AppRoute | AppRouter` — a nested sub-router
 * carries no `path`/`method` of its own, so walking the contract has to
 * recurse. It does: `operator` is a sub-router, and treating it as a leaf
 * would silently drop every route under it from the coverage assertions
 * below, which is exactly the drift they exist to catch.
 */
function isLeafRoute(value: unknown): value is { path: string; method: string } {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as { path?: unknown; method?: unknown };
  return typeof candidate.path === 'string' && typeof candidate.method === 'string';
}

function collectRoutes(router: unknown): Array<{ path: string; method: string }> {
  if (router === null || typeof router !== 'object') return [];
  return Object.values(router).flatMap((value) =>
    isLeafRoute(value) ? [value] : collectRoutes(value)
  );
}

const contractRoutes = collectRoutes(bfmContract);

/** ts-rest declares path params as `:id`; OpenAPI templates them as `{id}`. */
function openApiPath(contractPath: string): string {
  return contractPath.replaceAll(/:(\w+)/gu, '{$1}');
}

describe('GET /openapi', () => {
  it('declares OpenAPI 3.0.x — 3.1 would break consumer codegen', async () => {
    const body = await fetchDocument();

    expect(body.openapi).toMatch(/^3\.0\.\d+$/);
  });

  it('is titled for this package, so a misrouted fetch is obvious', async () => {
    const body = await fetchDocument();

    expect(body.info?.title).toBe('@pops/bfm');
  });

  it('covers every route the ts-rest contract declares', async () => {
    const body = await fetchDocument();

    expect(contractRoutes.length).toBeGreaterThan(0);
    for (const { path, method } of contractRoutes) {
      expect(body.paths?.[openApiPath(path)]?.[method.toLowerCase()]).toBeDefined();
    }
  });

  it('addresses the health route by the operationId the SDK route map keys on', async () => {
    const body = await fetchDocument();

    expect(body.paths?.['/health']?.['get']?.operationId).toBe('health');
  });

  it('namespaces the operator sub-router in its operationIds', async () => {
    const body = await fetchDocument();

    expect(body.paths?.['/operator/pairing/codes']?.['post']?.operationId).toBe(
      'operator.issuePairingCode'
    );
    expect(body.paths?.['/operator/devices']?.['get']?.operationId).toBe('operator.listDevices');
    expect(body.paths?.['/operator/devices/{id}']?.['delete']?.operationId).toBe(
      'operator.revokeDevice'
    );
  });

  it('declares no route the contract does not, so the document cannot over-promise', async () => {
    const body = await fetchDocument();

    const contractPaths = contractRoutes.map((route) => openApiPath(route.path));
    expect(Object.keys(body.paths ?? {}).toSorted()).toEqual(contractPaths.toSorted());
  });
});
