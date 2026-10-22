/**
 * `GET /paperless/tasks/:taskId`, `PATCH` and `DELETE /paperless/documents/:id`
 * through the real app against a fake Paperless 3.2.1.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startFakePaperless, type FakePaperless } from '../__tests__/fake-paperless.js';
import { createTestTransport } from '../__tests__/test-http.js';
import { unreachablePaperlessUrl } from '../__tests__/unreachable-url.js';
import { createDocumentsApiApp } from '../app.js';

const { requestOn } = createTestTransport();

let fake: FakePaperless;

function api() {
  return requestOn(
    createDocumentsApiApp({ version: '0.0.1-test', selfBaseUrl: 'http://localhost:3012' })
  );
}

beforeEach(async () => {
  fake = await startFakePaperless();
  fake.documents.set(7, {
    bytes: Buffer.from('x'),
    mimeType: 'application/pdf',
    fileName: 'manual.pdf',
    title: 'Manual',
  });
  vi.stubEnv('PAPERLESS_BASE_URL', fake.url);
  vi.stubEnv('PAPERLESS_API_TOKEN', 'test-token');
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await fake.close();
});

describe('GET /paperless/tasks/:taskId', () => {
  it.each([
    ['pending', null, { state: 'pending', documentId: null, reason: null }],
    ['started', null, { state: 'pending', documentId: null, reason: null }],
    ['success', { document_id: 41 }, { state: 'done', documentId: 41, reason: null }],
    [
      'failure',
      { duplicate_of: 12, duplicate_in_trash: false },
      { state: 'duplicate', documentId: 12, reason: null },
    ],
    [
      'failure',
      { error_type: 'ParseError', error_message: 'Unsupported mime type' },
      { state: 'failed', documentId: null, reason: 'Unsupported mime type' },
    ],
  ])('maps a %s task with %j', async (status, resultData, expected) => {
    fake.tasks.set('3f2c-uuid', { status, result_data: resultData });

    const res = await api().get('/paperless/tasks/3f2c-uuid');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: expected });
    expect(fake.requests[0]?.url).toBe('/api/tasks/?task_id=3f2c-uuid');
    expect(fake.requests[0]?.headers.accept).toBe('application/json; version=10');
  });

  it('404s an unknown task id with the task code, not the document one', async () => {
    const res = await api().get('/paperless/tasks/nope');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      code: 'documents.paperless.task_not_found',
      retryable: false,
    });
  });

  it('502s a task status this pillar does not recognise', async () => {
    fake.tasks.set('t1', { status: 'exploded', result_data: null });

    const res = await api().get('/paperless/tasks/t1');

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ code: 'documents.paperless.upstream_failure' });
  });

  it('400s a task id that is not a Celery id, without contacting Paperless', async () => {
    const res = await api().get('/paperless/tasks/a.b');

    expect(res.status).toBe(400);
    expect(fake.requests).toHaveLength(0);
  });

  it('412s unconfigured and 503s unreachable', async () => {
    vi.stubEnv('PAPERLESS_BASE_URL', '');
    const unconfigured = await api().get('/paperless/tasks/t1');
    vi.stubEnv('PAPERLESS_BASE_URL', await unreachablePaperlessUrl());
    const unreachable = await api().get('/paperless/tasks/t1');

    expect(unconfigured.status).toBe(412);
    expect(unconfigured.body).toMatchObject({ code: 'documents.paperless.not_configured' });
    expect(unreachable.status).toBe(503);
    expect(unreachable.body).toMatchObject({
      code: 'documents.paperless.unavailable',
      retryable: true,
    });
  });
});

describe('PATCH /paperless/documents/:id', () => {
  it('sends only the given keys and returns the updated document', async () => {
    const res = await api().patch('/paperless/documents/7').send({ title: 'Kettle manual' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: { id: 7, title: 'Kettle manual' } });
    expect(fake.requests[0]?.method).toBe('PATCH');
    expect(JSON.parse(fake.requests[0]?.body ?? '')).toEqual({ title: 'Kettle manual' });
  });

  it('sends an empty object for an empty patch', async () => {
    const res = await api().patch('/paperless/documents/7').send({});

    expect(res.status).toBe(200);
    expect(JSON.parse(fake.requests[0]?.body ?? '')).toEqual({});
  });

  it('400s a key outside the patch shape without contacting Paperless', async () => {
    const res = await api().patch('/paperless/documents/7').send({ content: 'replaced' });

    expect(res.status).toBe(400);
    expect(fake.requests).toHaveLength(0);
  });

  it('404s a document Paperless does not have', async () => {
    const res = await api().patch('/paperless/documents/8').send({ title: 'x' });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'documents.paperless.not_found' });
  });

  it('412s unconfigured, 503s unreachable and 502s an upstream failure', async () => {
    fake.failWith = 500;
    const failed = await api().patch('/paperless/documents/7').send({ title: 'x' });
    vi.stubEnv('PAPERLESS_API_TOKEN', '');
    const unconfigured = await api().patch('/paperless/documents/7').send({ title: 'x' });
    vi.stubEnv('PAPERLESS_API_TOKEN', 'test-token');
    vi.stubEnv('PAPERLESS_BASE_URL', await unreachablePaperlessUrl());
    const unreachable = await api().patch('/paperless/documents/7').send({ title: 'x' });

    expect(failed.status).toBe(502);
    expect(unconfigured.status).toBe(412);
    expect(unreachable.status).toBe(503);
  });
});

describe('DELETE /paperless/documents/:id', () => {
  it('deletes the document in Paperless and answers 204', async () => {
    const res = await api().delete('/paperless/documents/7');

    expect(res.status).toBe(204);
    expect(fake.documents.has(7)).toBe(false);
    expect(fake.requests[0]?.method).toBe('DELETE');
    expect(fake.requests[0]?.url).toBe('/api/documents/7/');
  });

  it('404s only when Paperless says the document is gone', async () => {
    const missing = await api().delete('/paperless/documents/8');
    fake.failWith = 503;
    const outage = await api().delete('/paperless/documents/7');

    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ code: 'documents.paperless.not_found' });
    expect(outage.status).toBe(502);
  });

  it('412s unconfigured and 503s unreachable', async () => {
    vi.stubEnv('PAPERLESS_BASE_URL', '');
    const unconfigured = await api().delete('/paperless/documents/7');
    vi.stubEnv('PAPERLESS_BASE_URL', await unreachablePaperlessUrl());
    const unreachable = await api().delete('/paperless/documents/7');

    expect(unconfigured.status).toBe(412);
    expect(unreachable.status).toBe(503);
  });
});
