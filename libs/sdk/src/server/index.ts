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
  INTERNAL_CREDENTIAL_HEADER,
  authenticateInternal,
  parseInternalCallers,
} from './internal-token.js';
export type {
  InternalCaller,
  InternalCallerSpec,
  InternalAuthConfig,
  InternalAuthReason,
  InternalAuthResult,
  InternalAuthRequest,
} from './internal-token.js';
export {
  buildContractScopeMap,
  hasScopeFor,
  resolveContractScope,
} from './service-account-scope.js';
export type { ContractScopeMap, ContractScopeRoute } from './service-account-scope.js';
export { authorizeServiceAccountRequest, SERVICE_ACCOUNT_HEADER } from './service-account-auth.js';
export type {
  ServiceAccountAuthReason,
  ServiceAccountAuthRequest,
  ServiceAccountAuthResult,
  ServiceAccountPrincipal,
  ServiceAccountVerification,
  ServiceAccountVerifier,
} from './service-account-auth.js';
export { createRegistryServiceAccountVerifier } from './service-account-verifier.js';
export type { RegistryServiceAccountVerifierOptions } from './service-account-verifier.js';

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
