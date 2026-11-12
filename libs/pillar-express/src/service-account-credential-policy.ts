import type { RequestPrincipal } from './request-principal.js';
import type { ServiceAccountScopeGateOptions } from './service-account-scope-gate.js';

/** Decide whether the verified-operator exception removes a missing-key requirement. */
export function requiredCredentialFor(
  options: ServiceAccountScopeGateOptions,
  apiKey: string | undefined,
  principal: RequestPrincipal
): boolean | undefined {
  const hasNoKey = apiKey === undefined || apiKey === '';
  const verifiedOperator = principal.kind === 'operator' && principal.email !== null;
  return options.allowVerifiedAccessOperatorWithoutServiceAccountCredential === true &&
    options.requireCredential === true &&
    hasNoKey &&
    verifiedOperator
    ? false
    : options.requireCredential;
}
