export {
  seedRegistryCache,
  failNextRegistryFetches,
  configureDiscoveryForTest,
} from './discovery.js';
export { fakePillarHandle, type FakeProcedure, type FakeRouterTree } from './fake-handle.js';
export { resolvePillarDir } from './pillar-dir.js';
export {
  getFreePort,
  spawnPillarProcess,
  type SpawnPillarProcessOptions,
  type SpawnedPillarProcess,
} from './process-harness.js';
export {
  startRecordingProxy,
  type RecordedProxyRequest,
  type RecordingProxy,
} from './recording-proxy.js';
export { waitForRegistration } from './registration-wait.js';
