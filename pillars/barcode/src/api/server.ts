import {
  bootstrapPillar,
  shutdownPillar,
  type PillarBootstrapHandle,
} from '@pops/pillar-sdk/bootstrap';

import { openBarcodeDb } from '../db/index.js';
import { createBarcodeLookupService } from '../lookup/service.js';
import { createBarcodeApiApp } from './app.js';
import {
  resolveBarcodeSqlitePath,
  resolvePort,
  resolveSelfBaseUrl,
  resolveVersion,
  shouldSelfRegister,
} from './boot-env.js';
import { buildBarcodeManifest } from './manifest.js';

const port = resolvePort();
const version = resolveVersion();
const selfBaseUrl = resolveSelfBaseUrl(port);
const barcodeDb = openBarcodeDb(resolveBarcodeSqlitePath());
const lookupService = createBarcodeLookupService({ db: barcodeDb.db, sources: [] });
const app = createBarcodeApiApp({ barcodeDb, version, selfBaseUrl, lookupService });

const server = app.listen(port, () => {
  console.warn(`[barcode-api] Listening on port ${port}`);
});

let pillarHandle: PillarBootstrapHandle | undefined;
if (shouldSelfRegister()) {
  pillarHandle = await bootstrapPillar({
    manifest: buildBarcodeManifest(version),
    baseUrl: selfBaseUrl,
  });
}

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[barcode-api] Shutting down (${signal})`);
  void shutdownPillar({
    label: 'barcode-api',
    steps: [{ name: 'deregister', run: () => pillarHandle?.stop() }],
    server,
    closeDb: () => barcodeDb.raw.close(),
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
