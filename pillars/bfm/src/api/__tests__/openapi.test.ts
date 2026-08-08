/**
 * Guards the committed `openapi/bfm.openapi.json` projection.
 *
 * The version pin is the load-bearing assertion here: the client generators
 * downstream (including the iOS client's) target OpenAPI 3.0, so a document
 * that drifted to 3.1 would break *consumers* rather than failing this
 * pillar's own build. See AGENTS.md "The OpenAPI version pin".
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { bfmContract } from '../../contract/rest.js';
import { createBfmApiApp } from '../app.js';

type Operation = { operationId?: unknown };
type OpenApiBody = {
  openapi?: unknown;
  info?: { title?: unknown };
  paths?: Record<string, Record<string, Operation> | undefined>;
};

async function fetchDocument(): Promise<OpenApiBody> {
  const app = createBfmApiApp({ version: '0.0.1-test' });
  const res = await request(app).get('/openapi');
  expect(res.status).toBe(200);
  return res.body as OpenApiBody;
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

    for (const route of Object.values(bfmContract)) {
      const { path, method } = route as { path: string; method: string };
      expect(body.paths?.[path]?.[method.toLowerCase()]).toBeDefined();
    }
  });

  it('addresses the health route by the operationId the SDK route map keys on', async () => {
    const body = await fetchDocument();

    expect(body.paths?.['/health']?.['get']?.operationId).toBe('health');
  });

  it('declares no route the contract does not, so the document cannot over-promise', async () => {
    const body = await fetchDocument();

    const contractPaths = Object.values(bfmContract).map(
      (route) => (route as { path: string }).path
    );
    expect(Object.keys(body.paths ?? {}).toSorted()).toEqual(contractPaths.toSorted());
  });
});
