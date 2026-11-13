import { once } from 'node:events';
import { createServer } from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestTransport } from '../__tests__/test-http.js';
import { createDocumentsApiApp } from '../app.js';
import { uploadFixture } from './__tests__/fixture.js';
import { deferred } from './__tests__/streams.js';

import type { ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const { requestOn } = createTestTransport();
afterEach(() => {
  vi.unstubAllEnvs();
});

function verifier(scopes: readonly string[]): ServiceAccountVerifier {
  return () =>
    Promise.resolve({
      outcome: 'authenticated',
      principal: { id: 'fixture-principal', name: 'fixture', scopes },
    });
}

describe('four-operation durable upload HTTP contract', () => {
  it('retains a known task after the consumer connection is aborted before the actual owner ACK', async () => {
    const fixture = await uploadFixture();
    const completion = deferred<void>();
    const dispatch = fixture.service.dispatch.bind(fixture.service);
    const observer = vi
      .spyOn(fixture.service, 'dispatch')
      .mockImplementation(async (operationId) => {
        try {
          return await dispatch(operationId);
        } finally {
          completion.resolve();
        }
      });
    const app = createDocumentsApiApp({
      version: 'test',
      selfBaseUrl: 'http://localhost:3012',
      uploads: fixture.service,
    });
    const server = createServer(app);
    await once(server.listen(0, '127.0.0.1'), 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('Missing loopback address');
    try {
      await fixture.admit();
      fixture.setMode('held');
      const controller = new AbortController();
      const response = fetch(
        `http://127.0.0.1:${address.port}/paperless/uploads/${fixture.input.operationId}/dispatch`,
        { method: 'POST', signal: controller.signal }
      );
      const upstream = await fixture.waitHeld();
      controller.abort();
      await expect(response).rejects.toThrow();
      upstream.setHeader('Content-Type', 'application/json');
      upstream.end(JSON.stringify('task-proof-1'));
      await completion.promise;
      fixture.reopen();
      fixture.setTask('unavailable');
      expect(await fixture.service.get(fixture.input.operationId)).toMatchObject({
        state: 'accepted',
        taskId: 'task-proof-1',
      });
      await fixture.service.dispatch(fixture.input.operationId);
      expect(fixture.posts).toBe(1);
    } finally {
      observer.mockRestore();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
        server.closeAllConnections();
      });
      await fixture.close();
    }
  });

  it('admits raw content, returns an exact committed task, and recovers that receipt after a producer reopen', async () => {
    const fixture = await uploadFixture();
    try {
      const api = requestOn(
        createDocumentsApiApp({
          version: 'test',
          selfBaseUrl: 'http://localhost:3012',
          uploads: fixture.service,
        })
      );
      const created = await api.post('/paperless/uploads').send(fixture.input);
      expect(created.status).toBe(200);
      expect(created.body.data).toMatchObject({ input: fixture.input, state: 'awaiting_content' });
      const content = await api
        .put(`/paperless/uploads/${fixture.input.operationId}/content`)
        .set('Content-Type', 'Application/PDF; charset=binary')
        .send(fixture.bytes);
      expect(content.status).toBe(200);
      expect(content.body.data.state).toBe('admitted');
      expect(fixture.posts).toBe(0);
      const dispatched = await api.post(`/paperless/uploads/${fixture.input.operationId}/dispatch`);
      expect(dispatched.status).toBe(200);
      expect(dispatched.body.data).toMatchObject({
        state: 'accepted',
        taskId: 'task-proof-1',
        documentId: null,
      });
      fixture.reopen();
      fixture.setTask('unavailable');
      const reopened = requestOn(
        createDocumentsApiApp({
          version: 'test',
          selfBaseUrl: 'http://localhost:3012',
          uploads: fixture.service,
        })
      );
      expect(
        (await reopened.get(`/paperless/uploads/${fixture.input.operationId}`)).body.data
      ).toEqual(dispatched.body.data);
      expect(
        (await reopened.post(`/paperless/uploads/${fixture.input.operationId}/dispatch`)).body.data
      ).toEqual(dispatched.body.data);
      expect(fixture.posts).toBe(1);
    } finally {
      await fixture.close();
    }
  });

  it('does not grant content/dispatch via a read grant or read proof via a write grant', async () => {
    const fixture = await uploadFixture();
    try {
      fixture.service.create(fixture.input);
      const api = (scopes: readonly string[]) =>
        requestOn(
          createDocumentsApiApp({
            version: 'test',
            selfBaseUrl: 'http://localhost:3012',
            uploads: fixture.service,
            serviceAccountVerifier: verifier(scopes),
          })
        );
      for (const scope of ['documents.paperless', 'documents.paperless.upload']) {
        const read = api([scope]);
        expect(
          (
            await read
              .get(`/paperless/uploads/${fixture.input.operationId}`)
              .set('X-API-Key', 'fixture')
          ).status
        ).toBe(200);
        expect(
          (await read.post('/paperless/uploads').set('X-API-Key', 'fixture').send(fixture.input))
            .status
        ).toBe(403);
        expect(
          (
            await read
              .put(`/paperless/uploads/${fixture.input.operationId}/content`)
              .set('X-API-Key', 'fixture')
              .set('Content-Type', 'application/pdf')
              .send(fixture.bytes)
          ).status
        ).toBe(403);
        expect(
          (
            await read
              .post(`/paperless/uploads/${fixture.input.operationId}/dispatch`)
              .set('X-API-Key', 'fixture')
          ).status
        ).toBe(403);
      }
      expect(
        (
          await api(['documents.write'])
            .get(`/paperless/uploads/${fixture.input.operationId}`)
            .set('X-API-Key', 'fixture')
        ).status
      ).toBe(403);
      expect(fixture.posts).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  it('refuses extra metadata, wrong MIME, unknown operation, unsupported policy and over-limit admission without upstream activity', async () => {
    const fixture = await uploadFixture();
    try {
      const api = requestOn(
        createDocumentsApiApp({
          version: 'test',
          selfBaseUrl: 'http://localhost:3012',
          uploads: fixture.service,
        })
      );
      expect(
        (await api.post('/paperless/uploads').send({ ...fixture.input, invented: true })).status
      ).toBe(400);
      expect(
        (
          await api
            .post('/paperless/uploads')
            .send({ ...fixture.input, mimeType: 'application/zip' })
        ).status
      ).toBe(415);
      vi.stubEnv('DOCUMENTS_MAX_UPLOAD_BYTES', '1');
      expect((await api.post('/paperless/uploads').send(fixture.input)).status).toBe(413);
      vi.unstubAllEnvs();
      expect((await api.post('/paperless/uploads').send(fixture.input)).status).toBe(200);
      expect(
        (
          await api
            .put(`/paperless/uploads/${fixture.input.operationId}/content`)
            .set('Content-Type', 'text/plain')
            .send(fixture.bytes)
        ).status
      ).toBe(400);
      expect(
        (await api.get('/paperless/uploads/00000000-0000-4000-8000-000000000001')).status
      ).toBe(404);
      expect(fixture.posts).toBe(0);
    } finally {
      await fixture.close();
    }
  });
});
