export { pillar, __resetServerPillarCache } from './factory.js';
export type { ServerPillarOptions } from './factory.js';
export {
  configureServerSdk,
  getServerSdkConfig,
  resolveApiKey,
  SERVER_SDK_API_KEY_ENV,
  __resetServerSdkConfig,
} from './config.js';
export type { ServerSdkConfig } from './config.js';
export { PillarServerSdkError } from './errors.js';
export { InternalBaseUrlTransport } from './transport.js';
export { createSinkHandler } from './sinks.js';
export type { SinkHandler, SinkHandlerOptions, SinkInvocationResult } from './sinks.js';
export {
  INTERNAL_TOKEN_HEADER,
  INTERNAL_CREDENTIAL_HEADER,
  passesInternalToken,
  authenticateInternal,
  parseInternalCallers,
} from './internal-token.js';
export type {
  InternalTokenCheck,
  InternalCaller,
  InternalCallerSpec,
  InternalAuthConfig,
  InternalAuthReason,
  InternalAuthResult,
  InternalAuthRequest,
} from './internal-token.js';

export type {
  PillarHandle,
  CallableProcedure,
  PillarClientOptions,
  DiscoveredPillar,
  DiscoveryTransport,
  CallFailure,
  CallResult,
  CallSuccess,
} from '../client/index.js';
export {
  PillarCallError,
  PillarSdkError,
  isOk,
  isNotFound,
  isConflict,
  isBadRequest,
} from '../client/index.js';
