import { once } from 'node:events';
import { createServer } from 'node:http';

import { describe, expect, it } from 'vitest';

import { createMobileDocumentsBytesClient } from './bytes-client.js';

describe('Documents owner raw transport boundary', () => {
  it('rejects unexpected redirects instead of forwarding credentials or accepting redirected bytes', async () => {
    const paths: string[] = [];
    const server = createServer((req, res) => {
      paths.push(req.url ?? '');
      if (req.url === '/paperless/documents/31/download') {
        res.writeHead(302, { location: '/unexpected' });
        res.end();
        return;
      }
      res.end('not the requested owner representation');
    });
    await once(server.listen(0, '127.0.0.1'), 'listening');
    try {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('Expected TCP address');
      const client = createMobileDocumentsBytesClient({
        discovery: {
          lookup: () => Promise.resolve({ baseUrl: `http://127.0.0.1:${address.port}` }),
        },
        apiKey: () => 'pops_sa_test_fixture',
      });
      const result = await client.file(31, undefined);
      await result?.body?.cancel();
      expect(result).toBeNull();
      expect(paths).toEqual(['/paperless/documents/31/download']);
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    }
  });
});
