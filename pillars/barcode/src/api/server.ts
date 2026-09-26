import {
  bootstrapPillar,
  shutdownPillar,
  type PillarBootstrapHandle,
} from '@pops/pillar-sdk/bootstrap';
import { assertSecretFilesReadable } from '@pops/pillar-sdk/pillar-env';

import { openBarcodeDb } from '../db/index.js';
import { createBarcodeLookupService } from '../lookup/service.js';
import { createGoogleBooksSource } from '../lookup/sources/google-books.js';
import { createOpenLibrarySource } from '../lookup/sources/open-library.js';
import { createBarcodeApiApp } from './app.js';
import {
  resolveBarcodeSqlitePath,
  resolvePort,
  resolveSelfBaseUrl,
  resolveUserAgentContact,
  resolveVersion,
  shouldSelfRegister,
} from './boot-env.js';
import { buildBarcodeManifest } from './manifest.js';

assertSecretFilesReadable();

const port = resolvePort();
const version = resolveVersion();
const selfBaseUrl = resolveSelfBaseUrl(port);
const userAgentContact = resolveUserAgentContact();
const barcodeDb = openBarcodeDb(resolveBarcodeSqlitePath());
const lookupService = createBarcodeLookupService({
  db: barcodeDb.db,
  sources: [createOpenLibrarySource({ userAgentContact }), createGoogleBooksSource()],
});
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
