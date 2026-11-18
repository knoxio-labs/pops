import { describe, expect, it, vi } from 'vitest';

import { createBookingDocumentReader } from '../rest/booking-document-original.js';

describe('Booking Documents original owner transport', () => {
  it('uses the exact original byte route and refuses redirects without forwarding credentials', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'Application/PDF; version=1.7' },
        })
    );
    const read = createBookingDocumentReader({
      discovery: { lookup: async () => ({ baseUrl: 'http://documents.test' }) },
      apiKey: () => 'fictional-test-credential',
      fetchImpl,
    });
    expect(await read({ documentId: 72 })).toEqual({
      origin: 'http://documents.test',
      mediaType: 'application/pdf',
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://documents.test/paperless/documents/72/download?original=true',
      expect.objectContaining({ method: 'GET', redirect: 'error' })
    );
    fetchImpl.mockResolvedValueOnce(
      new Response(null, { status: 303, headers: { location: 'http://foreign.test/file' } })
    );
    await expect(read({ documentId: 72 })).rejects.toMatchObject({
      code: 'booking_import_unavailable',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not deliver bytes after owner changes, partial replies or late body failure', async () => {
    let baseUrl = 'http://documents.test';
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      baseUrl = 'http://different-owner.test';
      return new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      });
    });
    const read = createBookingDocumentReader({
      discovery: { lookup: async () => ({ baseUrl }) },
      apiKey: () => 'fictional-test-credential',
      fetchImpl,
    });
    await expect(read({ documentId: 72 })).rejects.toMatchObject({
      code: 'booking_import_unavailable',
    });
    fetchImpl.mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 206 }));
    await expect(read({ documentId: 72 })).rejects.toMatchObject({
      code: 'booking_import_unavailable',
    });
    fetchImpl.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error('Truncated original'));
          },
        }),
        { status: 200, headers: { 'content-type': 'application/pdf' } }
      )
    );
    await expect(read({ documentId: 72 })).rejects.toMatchObject({
      code: 'booking_import_unavailable',
    });
  });

  it.each(['image/png', 'text/plain', 'application/octet-stream', 'not a media type', null])(
    'rejects actual unsupported or unverifiable owner media %j',
    async (contentType) => {
      const response = new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: contentType === null ? {} : { 'content-type': contentType },
      });
      if (response.body === null) throw new Error('Expected original response body');
      const cancel = vi.spyOn(response.body, 'cancel');
      const fetchImpl = vi.fn<typeof fetch>(async () => response);
      const read = createBookingDocumentReader({
        discovery: { lookup: async () => ({ baseUrl: 'http://documents.test' }) },
        apiKey: () => 'fictional-test-credential',
        fetchImpl,
      });
      await expect(read({ documentId: 72 })).rejects.toMatchObject({
        code: 'booking_import_invalid',
      });
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  );
});
