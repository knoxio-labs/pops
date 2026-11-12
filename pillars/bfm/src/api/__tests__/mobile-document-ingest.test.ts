import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_DEVICE_CAPABILITIES,
  GUEST_DEVICE_CAPABILITIES,
} from '../../contract/capabilities.js';
import { closeOpenedApps, get, openWithOptions } from './mobile-inventory-app.js';
import { requestOn } from './test-http.js';

import type { MobileDocumentsClient } from '../documents/client.js';
import type {
  DocumentIngestRequest,
  MobileDocumentsUploadClient,
} from '../documents/upload-client.js';

const policy = {
  configured: true,
  available: true,
  maxUploadBytes: 4,
  allowedMimeTypes: ['application/pdf'],
};
function reader(value = policy): MobileDocumentsClient {
  return {
    status: vi.fn<MobileDocumentsClient['status']>(() => Promise.resolve({ kind: 'ok', value })),
    task: vi.fn<MobileDocumentsClient['task']>(() =>
      Promise.resolve({ kind: 'ok', value: { state: 'pending', documentId: null, reason: null } })
    ),
    getDocument: vi.fn<MobileDocumentsClient['getDocument']>(() =>
      Promise.resolve({ kind: 'not-found', pillar: 'documents', status: 404 })
    ),
  };
}
function accepted(): MobileDocumentsUploadClient {
  return {
    upload: vi.fn<MobileDocumentsUploadClient['upload']>(async (input: DocumentIngestRequest) => {
      const bytes = await new Response(input.body).text();
      expect(bytes).toBe('%PDF');
      return {
        kind: 'response',
        response: Response.json({ data: { taskId: 'task_1' } }, { status: 202 }),
      };
    }),
  };
}
afterEach(closeOpenedApps);
describe('Direct Documents ingestion perimeter and stream', () => {
  it('does not grant upload to default or guest devices and refuses before policy/body work', async () => {
    expect(DEFAULT_DEVICE_CAPABILITIES).not.toContain('documents.upload');
    expect(GUEST_DEVICE_CAPABILITIES).not.toContain('documents.upload');
    const documents = reader();
    const documentUploads = accepted();
    const { app, token } = openWithOptions({ documents, documentUploads });
    const unauthenticated = await requestOn(app, (r) =>
      r.post('/mobile/documents?fileName=ticket.pdf').send('%PDF')
    );
    expect(unauthenticated.status).toBe(401);
    const denied = await requestOn(app, (r) =>
      r
        .post('/mobile/documents?fileName=ticket.pdf')
        .set('Authorization', `Bearer ${token}`)
        .send('%PDF')
    );
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ capability: 'documents.upload' });
    expect(documents.status).not.toHaveBeenCalled();
    expect(documentUploads.upload).not.toHaveBeenCalled();
  });
  it('allows upload-only authority, performs internal policy read and returns only exact accepted task', async () => {
    const documents = reader();
    const documentUploads = accepted();
    const { app, token } = openWithOptions({ documents, documentUploads }, ['documents.upload']);
    expect((await get(app, token, '/mobile/documents/status')).status).toBe(403);
    expect((await get(app, token, '/mobile/documents/tasks/task_1')).status).toBe(403);
    const response = await requestOn(app, (r) =>
      r
        .post('/mobile/documents?fileName=ticket.pdf&title=Original')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/pdf; charset=binary')
        .send('%PDF')
    );
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ taskId: 'task_1' });
    expect(documents.status).toHaveBeenCalledTimes(1);
    expect(documentUploads.upload).toHaveBeenCalledTimes(1);
    expect(documentUploads.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { fileName: 'ticket.pdf', title: 'Original' },
        contentType: 'application/pdf',
        contentLength: '4',
      })
    );
    expect(response.headers['cache-control']).toContain('no-store');
  });
  it.each(['image/png', 'text/plain', 'image/svg+xml', 'IMAGE/PNG; charset=binary'])(
    'honors owner MIME family policy for%s',
    async (mime) => {
      const documentUploads = accepted();
      const { app, token } = openWithOptions(
        {
          documents: reader({
            ...policy,
            allowedMimeTypes: ['application/pdf', 'image/*', 'text/*'],
          }),
          documentUploads,
        },
        ['documents.upload']
      );
      const response = await requestOn(app, (r) =>
        r
          .post('/mobile/documents?fileName=original')
          .set('Authorization', `Bearer ${token}`)
          .set('Content-Type', mime)
          .send('%PDF')
      );
      expect(response.status).toBe(202);
      expect(documentUploads.upload).toHaveBeenCalledTimes(1);
    }
  );
  it.each(['application/json', 'image/', 'image/*', 'not-a-mime'])(
    'does not widen family policy to%s',
    async (mime) => {
      const documentUploads = accepted();
      const { app, token } = openWithOptions(
        {
          documents: reader({
            ...policy,
            allowedMimeTypes: ['application/pdf', 'image/*', 'text/*'],
          }),
          documentUploads,
        },
        ['documents.upload']
      );
      const response = await requestOn(app, (r) =>
        r
          .post('/mobile/documents?fileName=original')
          .set('Authorization', `Bearer ${token}`)
          .set('Content-Type', mime)
          .send('%PDF')
      );
      expect(response.status).toBe(415);
      expect(documentUploads.upload).not.toHaveBeenCalled();
    }
  );
  it.each([
    { query: 'fileName=ticket.pdf', mime: 'image/png', body: '%PDF', status: 415 },
    { query: 'fileName=ticket.pdf', mime: 'application/pdf', body: '%PDFx', status: 413 },
    { query: 'fileName=', mime: 'application/pdf', body: '%PDF', status: 400 },
    {
      query: 'fileName=ticket.pdf&itemId=inventory',
      mime: 'application/pdf',
      body: '%PDF',
      status: 400,
    },
    { query: 'fileName=ticket.pdf&title=', mime: 'application/pdf', body: '%PDF', status: 400 },
  ])(
    'refuses owner-policy or query mismatch before POST %#',
    async ({ query, mime, body, status }) => {
      const documentUploads = accepted();
      const { app, token } = openWithOptions({ documents: reader(), documentUploads }, [
        'documents.upload',
      ]);
      const response = await requestOn(app, (r) =>
        r
          .post(`/mobile/documents?${query}`)
          .set('Authorization', `Bearer ${token}`)
          .set('Content-Type', mime)
          .send(body)
      );
      expect(response.status).toBe(status);
      expect(documentUploads.upload).not.toHaveBeenCalled();
    }
  );
  it.each([false, true])(
    'unconfigured or unavailable policy never starts POST configured=%s',
    async (configured) => {
      const documentUploads = accepted();
      const { app, token } = openWithOptions(
        { documents: reader({ ...policy, configured, available: false }), documentUploads },
        ['documents.upload']
      );
      const response = await requestOn(app, (r) =>
        r
          .post('/mobile/documents?fileName=ticket.pdf')
          .set('Authorization', `Bearer ${token}`)
          .set('Content-Type', 'application/pdf')
          .send('%PDF')
      );
      expect(response.status).toBe(configured ? 503 : 412);
      expect(documentUploads.upload).not.toHaveBeenCalled();
    }
  );
  it.each([
    {},
    { data: { taskId: '' } },
    { data: { taskId: 'task_1', documentId: 77 } },
    { data: { taskId: 'task/1' } },
    { data: { taskId: 'task_1' }, unexpected: true },
  ])('does not acknowledge malformed202 %#', async (body) => {
    const upload = vi.fn(() =>
      Promise.resolve({ kind: 'response' as const, response: Response.json(body, { status: 202 }) })
    );
    const { app, token } = openWithOptions({ documents: reader(), documentUploads: { upload } }, [
      'documents.upload',
    ]);
    const response = await requestOn(app, (r) =>
      r
        .post('/mobile/documents?fileName=ticket.pdf')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/pdf')
        .send('%PDF')
    );
    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      code: 'bfm.documents.upload_outcome_unknown',
      retryable: false,
    });
    expect(upload).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403])(
    'does not turn owner%s into a device refresh/replay signal',
    async (status) => {
      const upload = vi.fn(() =>
        Promise.resolve({
          kind: 'response' as const,
          response: Response.json(
            { message: 'DO_NOT_RELAY', code: 'private-auth-detail' },
            { status }
          ),
        })
      );
      const { app, token } = openWithOptions({ documents: reader(), documentUploads: { upload } }, [
        'documents.upload',
      ]);
      const response = await requestOn(app, (r) =>
        r
          .post('/mobile/documents?fileName=ticket.pdf')
          .set('Authorization', `Bearer ${token}`)
          .set('Content-Type', 'application/pdf')
          .send('%PDF')
      );
      expect(response.status).toBe(502);
      expect(response.body).toMatchObject({
        code: 'bfm.documents.upload_outcome_unknown',
        retryable: false,
        details: { cause: 'owner_auth_refused', upstream: { pillar: 'documents', status } },
      });
      expect(JSON.stringify(response.body)).not.toContain('DO_NOT_RELAY');
      expect(JSON.stringify(response.body)).not.toContain('private-auth-detail');
      expect(upload).toHaveBeenCalledTimes(1);
    }
  );
  it.each([400, 413, 415, 422])(
    'preserves definite owning refusal%s without a task or retry',
    async (status) => {
      const upload = vi.fn(() =>
        Promise.resolve({
          kind: 'response' as const,
          response: Response.json(
            {
              code: 'documents.upload.refused',
              message: 'Refused',
              requestId: 'synthetic',
              retryable: false,
            },
            { status }
          ),
        })
      );
      const { app, token } = openWithOptions({ documents: reader(), documentUploads: { upload } }, [
        'documents.upload',
      ]);
      const response = await requestOn(app, (r) =>
        r
          .post('/mobile/documents?fileName=ticket.pdf')
          .set('Authorization', `Bearer ${token}`)
          .set('Content-Type', 'application/pdf')
          .send('%PDF')
      );
      expect(response.status).toBe(status);
      expect(response.body).toMatchObject({ code: 'documents.upload.refused', retryable: false });
      expect(upload).toHaveBeenCalledTimes(1);
    }
  );
});
