import { once } from 'node:events';

import { openTripsDb } from '../../db/index.js';
import { createTripsApiApp } from '../app.js';

import type { TripsDb } from '../../db/index.js';
import type { BookingExtractionDependencies } from '../../db/services/booking-import-extract.js';

/** Real HTTP requests and the owning migrated SQLite database share one bounded test lifetime. */
export interface BookingApiFixture {
  readonly db: TripsDb;
  readonly post: (path: string, body: unknown, scope: string | null) => Promise<Response>;
  readonly get: (path: string, scope: string | null) => Promise<Response>;
}

/** Bind only a loopback API; fictional credential values select exact production scope checks. */
export async function withBookingApi(
  run: (fixture: BookingApiFixture) => Promise<void>,
  bookingExtraction?: BookingExtractionDependencies
): Promise<void> {
  const opened = openTripsDb(':memory:');
  const app = createTripsApiApp({
    tripsDb: opened,
    version: 'test',
    selfBaseUrl: 'http://localhost:3018',
    bookingExtraction,
    serviceAccountVerifier: async (scope) => ({
      outcome: 'authenticated',
      principal: { id: 'booking-test', name: 'booking-test', scopes: [scope] },
    }),
  });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Expected TCP server');
    const origin = `http://127.0.0.1:${address.port}`;
    const headers = (scope: string | null): Record<string, string> =>
      scope === null ? {} : { 'x-api-key': scope };
    await run({
      db: opened.db,
      post: (path, body, scope) =>
        fetch(`${origin}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers(scope) },
          body: JSON.stringify(body),
        }),
      get: (path, scope) => fetch(`${origin}${path}`, { headers: headers(scope) }),
    });
  } finally {
    server.closeIdleConnections();
    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    } finally {
      opened.raw.close();
    }
  }
}
