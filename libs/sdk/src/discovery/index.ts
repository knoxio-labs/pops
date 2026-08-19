export { lookupPillar, pillarRegistry } from './api.js';
export {
  setRegistryUrl,
  setCacheTtlMs,
  setFetchTimeoutMs,
  invalidateRegistryCache,
  disposeDiscoveryClient,
  DEFAULT_REGISTRY_URL,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_FETCH_TIMEOUT_MS,
  MIN_CACHE_TTL_MS,
} from './cache.js';
export {
  RegistryUnreachableError,
  type PillarSnapshot,
  type PillarStatus,
  type RegistrySnapshot,
} from './types.js';
export {
  parseRegistrySnapshotResponse,
  RegistrySnapshotPayloadSchema,
  type RegistrySnapshotPayload,
  type PillarRegistryEntryPayload,
} from './snapshot-schema.js';
export {
  computeBackoffDelay,
  startReconnectingSubscription,
  RECONNECT_INITIAL_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
  RECONNECT_BACKOFF_FACTOR,
  type ReconnectingSubscription,
  type ReconnectingSubscriptionOptions,
  type SubscriptionHandle,
} from './reconnect.js';
