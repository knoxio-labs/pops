import type { RequestPrincipal } from './request-principal.js';

/** Credential posture shared by gates and their service-account decision. */
export interface CredentialPolicyOptions {
  /**
   * Whether a credential is mandatory on scoped paths. Defaults to `false`,
   * the ADR-044 posture: callers without a key are left to the perimeter.
   */
  readonly requireCredential?: boolean;
  /**
   * Permit verified-email Access operators without a key on scoped routes.
   * A presented key is always checked. Requires `requireCredential: true`.
   */
  readonly allowVerifiedAccessOperatorWithoutServiceAccountCredential?: boolean;
}

/** Decide whether a verified operator qualifies for the keyless exception. */
export function requiredCredentialFor(
  options: CredentialPolicyOptions,
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
