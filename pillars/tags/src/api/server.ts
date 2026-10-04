import {
  bootstrapPillar,
  shutdownPillar,
  type PillarBootstrapHandle,
} from '@pops/pillar-sdk/bootstrap';

import { openTagsDb } from '../db/index.js';
import { createTagsApiApp } from './app.js';
import {
  resolvePort,
  resolveSelfBaseUrl,
  resolveTagsSqlitePath,
  resolveVersion,
  shouldSelfRegister,
} from './boot-env.js';
import { buildTagsManifest } from './manifest.js';

const port = resolvePort();
const version = resolveVersion();
const selfBaseUrl = resolveSelfBaseUrl(port);
const tagsDb = openTagsDb(resolveTagsSqlitePath());
const app = createTagsApiApp({ tagsDb, version, selfBaseUrl });

const server = app.listen(port, () => {
  console.warn(`[tags-api] Listening on port ${port}`);
});

let pillarHandle: PillarBootstrapHandle | undefined;
if (shouldSelfRegister()) {
  pillarHandle = await bootstrapPillar({
    manifest: buildTagsManifest(version),
    baseUrl: selfBaseUrl,
  });
}

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[tags-api] Shutting down (${signal})`);
  void shutdownPillar({
    label: 'tags-api',
    steps: [{ name: 'deregister', run: () => pillarHandle?.stop() }],
    server,
    closeDb: () => tagsDb.raw.close(),
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
