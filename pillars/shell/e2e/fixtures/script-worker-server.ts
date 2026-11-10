import { createServer } from 'node:http';

import type { RequestListener } from 'node:http';

/** A promise released by an observed browser or server event, without time-based waits. */
export function latch() {
  let complete: () => void = () => {
    throw new Error('Uninitialised latch');
  };
  const promise = new Promise<void>((resolve) => {
    complete = resolve;
  });
  return { promise, complete };
}

/** Serve held worker resources and close every connection during regression cleanup. */
export async function listen(handler: RequestListener) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Missing fixture address');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    },
  };
}
