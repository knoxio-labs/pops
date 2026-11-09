import {
  bootstrapPillar,
  shutdownPillar,
  type PillarBootstrapHandle,
} from '@pops/pillar-sdk/bootstrap';
import { assertSecretFilesReadable } from '@pops/pillar-sdk/pillar-env';

import { openTripsDb } from '../db/index.js';
import { createTripsApiApp } from './app.js';
import {
  resolvePort,
  resolveSelfBaseUrl,
  resolveTripsSqlitePath,
  resolveVersion,
  shouldSelfRegister,
} from './boot-env.js';
import { buildTripsManifest } from './manifest.js';
import { configureTripsServerSdk } from './server-sdk.js';

assertSecretFilesReadable();
configureTripsServerSdk();

const port = resolvePort();
const version = resolveVersion();
const selfBaseUrl = resolveSelfBaseUrl(port);
const tripsDb = openTripsDb(resolveTripsSqlitePath());
const app = createTripsApiApp({ tripsDb, version, selfBaseUrl });

const server = app.listen(port, () => {
  console.warn(`[trips-api] Listening on port ${port}`);
});

let pillarHandle: PillarBootstrapHandle | undefined;
if (shouldSelfRegister()) {
  pillarHandle = await bootstrapPillar({
    manifest: buildTripsManifest(version),
    baseUrl: selfBaseUrl,
  });
}

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[trips-api] Shutting down (${signal})`);
  void shutdownPillar({
    label: 'trips-api',
    steps: [{ name: 'deregister', run: () => pillarHandle?.stop() }],
    server,
    closeDb: () => tripsDb.raw.close(),
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
