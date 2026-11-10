import { once } from 'node:events';

import { openTripsDb } from '../../db/index.js';
import { createTrip } from '../../db/services/records.js';
import { createTripsApiApp } from '../app.js';

const opened = openTripsDb(':memory:');
const trip = createTrip(opened.db, {});
const server = createTripsApiApp({
  tripsDb: opened,
  version: 'test',
  selfBaseUrl: 'http://127.0.0.1',
  serviceAccountVerifier: async () => ({
    outcome: 'authenticated',
    principal: { id: 'fixture', name: 'Fixture', scopes: ['trips'] },
  }),
}).listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Expected TCP server');
process.stdout.write(
  JSON.stringify({ origin: `http://127.0.0.1:${address.port}`, tripId: trip.id }) + '\n'
);
process.once('SIGTERM', () => {
  server.closeIdleConnections();
  server.close(() => {
    opened.raw.close();
    process.exit(0);
  });
});
