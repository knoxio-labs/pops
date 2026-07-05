import { RegistryNetworkError, RegistryTransportError } from './transport.js';

import type { ValidationIssue } from '../manifest-schema/validate.js';

function describeIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => `${i.field || '<root>'}: ${i.reason}`).join('; ');
}

export class PillarManifestInvalidError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(`Manifest invalid: ${describeIssues(issues)}`);
    this.name = 'PillarManifestInvalidError';
    this.issues = issues;
  }
}

export class PillarRegistrationRejectedError extends Error {
  readonly issues: ValidationIssue[];
  readonly status: number;

  constructor(status: number, issues: ValidationIssue[]) {
    const detail = issues.length > 0 ? describeIssues(issues) : 'no issues reported';
    super(`Registry rejected manifest (${status}): ${detail}`);
    this.name = 'PillarRegistrationRejectedError';
    this.issues = issues;
    this.status = status;
  }
}

/**
 * Thrown internally to unwind {@link registerWithRetry}'s infinite retry loop
 * when `stop()` fires mid-backoff. Never escapes `bootstrapPillar` — it is
 * caught and swallowed, since a cancelled registration during shutdown is
 * expected, not a failure.
 */
export class PillarRegistrationCancelledError extends Error {
  constructor() {
    super('Registration cancelled (pillar is shutting down)');
    this.name = 'PillarRegistrationCancelledError';
  }
}

export function errSummary(err: unknown): string {
  if (err instanceof RegistryTransportError) {
    return `${err.name}(status=${err.status}): ${err.message}`;
  }
  if (err instanceof RegistryNetworkError) {
    return `${err.name}: ${err.message}`;
  }
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}
