export { createServiceAccountScopeGate } from './service-account-scope-gate.js';
export {
  createBodyParserErrorHandler,
  createPillarErrorHandlers,
  createPopsErrorHandler,
  createRequestIdMiddleware,
  createRequestValidationErrorHandler,
  createUnmatchedRouteHandler,
  defineErrors,
  PopsError,
} from './error-handling.js';
export { ErrorBodySchema } from '@pops/types';
export type { ErrorBody } from '@pops/types';
export type {
  ErrorDefinition,
  ErrorHandlerLogger,
  ErrorHandlers,
  ErrorMiddlewareOptions,
  PopsErrorOptions,
} from './error-handling.js';
export type {
  RawRouteDeclaration,
  RawRouteTree,
  ServiceAccountScopeGate,
  ServiceAccountScopeGateOptions,
} from './service-account-scope-gate.js';
