import { once } from 'node:events';
import http from 'node:http';

/** A loopback URL nothing listens on, for "Paperless is unreachable". */
export async function unreachablePaperlessUrl(): Promise<string> {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (typeof address !== 'object' || address === null) throw new Error('no port');
  return `http://127.0.0.1:${address.port}`;
}
