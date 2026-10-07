export { createServiceAccountScopeGate } from './service-account-scope-gate.js';
export { ACCESS_JWT_HEADER, readPrincipal } from './request-principal.js';
export { DELEGATED_SUBJECT_HEADER } from './delegated-subject.js';
export type { AccessIdentityOptions, RequestPrincipal } from './request-principal.js';
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
export type { ServiceAccountErrorHandlers } from './scope-gate-rejection.js';
