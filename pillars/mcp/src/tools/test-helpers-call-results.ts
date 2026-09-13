/**
 * `CallResult` constructors for tool tests.
 *
 * Their own module so `pillar-mocks-inventory.ts` can build its handles from
 * `callOk` without importing `test-helpers.ts`, which re-exports that module
 * and would close a cycle.
 */
import type { CallResult } from '@pops/pillar-sdk/client';

export function callOk<T>(value: T): CallResult<T> {
  return { kind: 'ok', value };
}

export const callUnavailable = (pillar: string): CallResult<never> => ({
  kind: 'unavailable',
  pillar,
});

export const callContractMismatch = (
  pillar: string,
  expected: string,
  actual: string
): CallResult<never> => ({ kind: 'contract-mismatch', pillar, expected, actual });
