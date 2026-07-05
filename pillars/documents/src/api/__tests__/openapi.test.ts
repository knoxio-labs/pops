/**
 * Smoke test for the documents-api `GET /openapi` route.
 *
 * The route serves the committed `openapi/documents.openapi.json` projection
 * verbatim so the pillar SDK can build its operationId route map against the
 * live pillar. This asserts the document is reachable, is OpenAPI 3.x, and
 * carries the known `paperless.status` / `paperless.search` operationIds.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createDocumentsApiApp } from '../app.js';

type OpenApiBody = {
  openapi?: unknown;
  paths?: Record<string, Record<string, { operationId?: unknown }> | undefined>;
};

describe('GET /openapi', () => {
  it('serves the committed projection as JSON (3.x + paperless.* operationIds)', async () => {
    const app = createDocumentsApiApp({
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3012',
    });

    const res = await request(app).get('/openapi');

    expect(res.status).toBe(200);
    const body = res.body as OpenApiBody;
    expect(body.openapi).toMatch(/^3\./);

    const operationIds = Object.values(body.paths ?? {})
      .filter((item): item is Record<string, { operationId?: unknown }> => item !== undefined)
      .flatMap((item) => Object.values(item))
      .map((operation) => operation.operationId);
    expect(operationIds).toContain('paperless.status');
    expect(operationIds).toContain('paperless.search');
  });
});
