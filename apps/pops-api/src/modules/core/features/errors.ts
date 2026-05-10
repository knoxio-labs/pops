import type { FeatureCredentialStatus } from '@pops/types';

/**
 * Thrown when `features.isEnabled()` (or any sibling resolver) is called
 * with a key that no installed module declares. The message names the
 * offending key and lists the module ids that were searched so operators
 * can quickly tell whether the call site is using a stale key or whether
 * the owning module is excluded by `POPS_APPS`.
 */
export class FeatureNotFoundError extends Error {
  /** The feature key that was looked up. */
  public readonly key: string;
  /** Module ids that were searched (in install order). */
  public readonly searched: readonly string[];

  constructor(key: string, searched: readonly string[] = []) {
    const list = searched.length === 0 ? '<none>' : searched.join(', ');
    super(`Unknown feature "${key}" — not declared by any installed module (searched: ${list})`);
    this.name = 'FeatureNotFoundError';
    this.key = key;
    this.searched = searched;
  }
}

export class FeatureGateError extends Error {
  constructor(
    public readonly key: string,
    public readonly missing: FeatureCredentialStatus[]
  ) {
    super(
      `Feature "${key}" cannot be enabled — missing: ${missing
        .map((m) => m.envVar ?? m.key)
        .join(', ')}`
    );
    this.name = 'FeatureGateError';
  }
}

export class FeatureScopeError extends Error {
  constructor(key: string, expected: string, actual: string) {
    super(`Feature "${key}" has scope "${actual}", expected "${expected}"`);
    this.name = 'FeatureScopeError';
  }
}
