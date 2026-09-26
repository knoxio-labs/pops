import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { openBarcodeDb, type OpenedBarcodeDb } from '../../db/index.js';
import { createBarcodeLookupService } from '../../lookup/service.js';
import { createBarcodeApiApp } from '../app.js';

import type { ServiceAccountVerifier } from '@pops/pillar-sdk/server';

let directory: string | undefined;
let opened: OpenedBarcodeDb | undefined;

afterEach(() => {
  opened?.raw.close();
  opened = undefined;
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function appFor(verifier: ServiceAccountVerifier) {
  directory = mkdtempSync(join(tmpdir(), 'barcode-api-test-'));
  opened = openBarcodeDb(join(directory, 'barcode.db'));
  return createBarcodeApiApp({
    barcodeDb: opened,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3016',
    lookupService: createBarcodeLookupService({ db: opened.db, sources: [] }),
    serviceAccountVerifier: verifier,
  });
}

const authenticated: ServiceAccountVerifier = async () => ({
  outcome: 'authenticated',
  principal: { id: 'sa_test', name: 'test', scopes: ['barcode.lookup'] },
});

describe('barcode HTTP app', () => {
  it('keeps health open', async () => {
    const app = appFor(async () => ({ outcome: 'rejected' }));

    await request(app).get('/health').expect(200);
  });

  it('returns 401 when lookup has no key', async () => {
    const app = appFor(authenticated);

    await request(app).get('/lookup/9780330423304').expect(401);
  });

  it('returns 403 when the key lacks barcode.lookup', async () => {
    const app = appFor(async () => ({
      outcome: 'authenticated',
      principal: { id: 'sa_test', name: 'test', scopes: [] },
    }));

    await request(app).get('/lookup/9780330423304').set('x-api-key', 'test-key').expect(403);
  });

  it('returns the lookup outcome for a scoped key', async () => {
    const app = appFor(authenticated);

    await request(app)
      .get('/lookup/9780330423304')
      .set('x-api-key', 'test-key')
      .expect(200, { outcome: 'not_found' });
  });

  it('maps an invalid code to the ADR error', async () => {
    const app = appFor(authenticated);

    await request(app).get('/lookup/9780330423305').set('x-api-key', 'test-key').expect(400, {
      message: 'The supplied barcode is invalid.',
      code: 'barcode.lookup.invalid_code',
    });
  });

  it('serves the committed OpenAPI projection', async () => {
    const app = appFor(authenticated);
    const response = await request(app).get('/openapi').expect(200);
    const committed: unknown = JSON.parse(
      readFileSync(
        join(
          dirname(fileURLToPath(import.meta.url)),
          '..',
          '..',
          '..',
          'openapi',
          'barcode.openapi.json'
        ),
        'utf8'
      )
    );

    expect(response.body).toEqual(committed);
    expect(response.body.openapi).toMatch(/^3\./u);
    expect(response.body.paths['/lookup/{code}'].get.operationId).toBe('lookup.get');
  });
});
