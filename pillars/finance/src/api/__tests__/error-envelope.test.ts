import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';
import { requestOn } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-errors-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  vi.restoreAllMocks();
  if (financeDb.raw.open) financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function app() {
  return createFinanceApiApp({
    financeDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3004',
    contacts: makeContactsFake(),
  });
}

describe('ADR-054 error envelope', () => {
  it('echoes a caller request ID in the response header and body', async () => {
    const response = await requestOn(app(), (agent) =>
      agent.get('/accounts/missing').set('x-request-id', 'finance-test-request')
    );

    expect(response.status).toBe(404);
    expect(response.headers['x-request-id']).toBe('finance-test-request');
    expect(response.body).toEqual({
      code: 'finance.resource.not_found',
      message: "Account 'missing' not found",
      requestId: 'finance-test-request',
      retryable: false,
    });
  });

  it('mints a request ID when the caller does not supply one', async () => {
    const response = await requestOn(app(), (agent) => agent.get('/missing-route'));

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: 'finance.route.not_found',
      requestId: expect.any(String),
      retryable: false,
    });
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
  });

  it('returns oversized JSON failures as envelopes instead of HTML', async () => {
    const response = await requestOn(app(), (agent) =>
      agent.post('/transactions').send({ payload: 'x'.repeat(21 * 1024 * 1024) })
    );

    expect(response.status).toBe(413);
    expect(response.type).toBe('application/json');
    expect(response.body).toMatchObject({
      code: 'finance.request.body_too_large',
      requestId: expect.any(String),
      retryable: false,
    });
  });

  it('hides unknown error messages and stacks while logging the request ID', async () => {
    const target = app();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    financeDb.raw.close();

    const response = await requestOn(target, (agent) =>
      agent.get('/transactions').set('x-request-id', 'finance-hidden-error')
    );

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      code: 'finance.internal',
      message: 'The service could not complete the request.',
      requestId: 'finance-hidden-error',
      retryable: false,
    });
    expect(response.text).not.toContain('database connection is not open');
    expect(response.text).not.toContain('Error:');
    expect(logged).toHaveBeenCalledWith(
      '[finance] unhandled request failure',
      expect.objectContaining({ requestId: 'finance-hidden-error' })
    );
  });
});
