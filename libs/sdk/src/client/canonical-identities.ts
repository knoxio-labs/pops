import { PillarCallError, PillarSdkError, type CallResult } from './errors.js';

/** One requested identifier and its canonical identity; null explicitly denotes an unknown id. */
export interface CanonicalIdentity {
  readonly id: string;
  readonly canonicalId: string | null;
}

/** An ordered complete batch resolved against a single producer revision. */
export interface CanonicalIdentityBatch {
  readonly data: readonly CanonicalIdentity[];
  readonly revision: number;
}

/** The injected producer operation; transport and credentials remain the consumer's responsibility. */
export type CanonicalIdentityOperation = (ids: string[]) => Promise<CallResult<unknown>>;

/** Batching limit and bounded retries when the producer changes during a multi-batch read. */
export interface CanonicalIdentityOptions {
  readonly batchSize?: number;
  readonly maxAttempts?: number;
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
}

function parseRevision(value: unknown): number {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('revision' in value) ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0
  ) {
    throw new PillarSdkError('Canonical identity response has an invalid revision');
  }
  return value.revision;
}

function parseCanonicalId(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new PillarSdkError('Canonical identity response has invalid or out-of-order ids');
  }
  return value;
}

function parseIdentity(row: unknown, expectedId: string | undefined): CanonicalIdentity {
  if (
    typeof row !== 'object' ||
    row === null ||
    !('id' in row) ||
    typeof row.id !== 'string' ||
    row.id !== expectedId ||
    !('canonicalId' in row)
  ) {
    throw new PillarSdkError('Canonical identity response has invalid or out-of-order ids');
  }
  return { id: row.id, canonicalId: parseCanonicalId(row.canonicalId) };
}

function parseIdentities(value: unknown, ids: readonly string[]): readonly CanonicalIdentity[] {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('data' in value) ||
    !Array.isArray(value.data) ||
    value.data.length !== ids.length
  ) {
    throw new PillarSdkError('Canonical identity response does not cover every requested id');
  }
  const rows: readonly unknown[] = value.data;
  return Array.from(rows, (row, index) => parseIdentity(row, ids[index]));
}

function parseBatch(value: unknown, ids: readonly string[]): CanonicalIdentityBatch {
  const revision = parseRevision(value);
  return { data: parseIdentities(value, ids), revision };
}

async function fetchBatch(
  ids: string[],
  operation: CanonicalIdentityOperation
): Promise<CanonicalIdentityBatch> {
  const result = await operation(ids);
  if (result.kind !== 'ok') throw new PillarCallError(result.pillar, result);
  return parseBatch(result.value, ids);
}

function appendBatch(resolved: Map<string, string | null>, batch: CanonicalIdentityBatch): void {
  for (const row of batch.data) {
    if (resolved.has(row.id) && resolved.get(row.id) !== row.canonicalId) {
      throw new PillarSdkError('Canonical identity response contradicts an earlier id');
    }
    resolved.set(row.id, row.canonicalId);
  }
}

async function readSnapshot(
  ids: readonly string[],
  operation: CanonicalIdentityOperation,
  batchSize: number
): Promise<Map<string, string | null> | undefined> {
  const resolved = new Map<string, string | null>();
  let revision: number | undefined;
  for (let offset = 0; offset < ids.length; offset += batchSize) {
    const batch = await fetchBatch(ids.slice(offset, offset + batchSize), operation);
    if (revision !== undefined && revision !== batch.revision) return undefined;
    revision = batch.revision;
    appendBatch(resolved, batch);
  }
  return resolved;
}

function assertCanonicalFixedPoints(resolved: ReadonlyMap<string, string | null>): void {
  for (const canonicalId of resolved.values()) {
    if (
      canonicalId !== null &&
      resolved.has(canonicalId) &&
      resolved.get(canonicalId) !== canonicalId
    ) {
      throw new PillarSdkError(
        'Canonical identity response does not resolve to a canonical fixed point'
      );
    }
  }
}

/**
 * Resolve every requested id without collapsing historical aliases or treating a failed call as missing.
 * Validates ordered coverage and explicit nulls. Batches must share one revision; a changing revision
 * restarts the complete read up to maxAttempts, then throws. SDK failures retain PillarCallError;
 * malformed or persistently changing snapshots throw PillarSdkError. Empty input performs no calls.
 */
export async function resolveCanonicalIds(
  ids: readonly string[],
  operation: CanonicalIdentityOperation,
  options: CanonicalIdentityOptions = {}
): Promise<ReadonlyMap<string, string | null>> {
  const batchSize = options.batchSize ?? 500;
  const maxAttempts = options.maxAttempts ?? 3;
  assertPositiveInteger(batchSize, 'batchSize');
  assertPositiveInteger(maxAttempts, 'maxAttempts');
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const resolved = await readSnapshot(ids, operation, batchSize);
    if (resolved !== undefined) {
      assertCanonicalFixedPoints(resolved);
      return resolved;
    }
  }
  throw new PillarSdkError(
    'Canonical identity revision changed throughout the resolution attempts'
  );
}
