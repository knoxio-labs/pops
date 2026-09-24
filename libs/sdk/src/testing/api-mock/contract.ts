import type { OperationKey } from './router.js';

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Every operation an OpenAPI document declares, as sorted `'<METHOD> <path>'`
 * keys — the same keys a mock handler set is indexed by.
 *
 * Takes the parsed document rather than a path so it runs anywhere; the caller
 * reads the committed spec, because the spec is the contract. A generated
 * client is one projection of it, and a projection that had dropped an
 * operation would agree with a mock layer that had dropped the same one.
 *
 * @throws When `document` has no `paths` object: a spec this could not read
 *   would otherwise make every coverage assertion vacuously true.
 */
export function contractOperations(document: unknown): OperationKey[] {
  if (!isRecord(document) || !isRecord(document['paths'])) {
    throw new Error('contractOperations: not an OpenAPI document (no `paths` object)');
  }
  const out: OperationKey[] = [];
  for (const [path, item] of Object.entries(document['paths'])) {
    if (!isRecord(item)) continue;
    for (const method of Object.keys(item)) {
      if (HTTP_METHODS.has(method)) out.push(`${method.toUpperCase()} ${path}`);
    }
  }
  return out.toSorted();
}

/** How a handler set lines up against the contract it stands in for. */
export interface ContractCoverage {
  /** Every operation the contract declares, sorted. */
  readonly operations: readonly OperationKey[];
  /** Declared operations with no handler — pages that will hit a 501. */
  readonly missing: readonly OperationKey[];
  /** Handlers for operations the contract does not declare — dead weight that reads as coverage. */
  readonly unexpected: readonly OperationKey[];
}

/**
 * Compare a mock handler set against an OpenAPI document in both directions.
 *
 * Both directions matter and they fail differently. An operation with no
 * handler is a page that will hit a 501 the first time someone opens the
 * standalone harness. A handler with no operation makes the count look right
 * while answering something the pillar no longer serves.
 */
export function contractCoverage(
  document: unknown,
  handlerKeys: Iterable<OperationKey>
): ContractCoverage {
  const operations = contractOperations(document);
  const declared = new Set(operations);
  const handled = new Set(handlerKeys);
  return {
    operations,
    missing: operations.filter((key) => !handled.has(key)),
    unexpected: [...handled].filter((key) => !declared.has(key)).toSorted(),
  };
}
