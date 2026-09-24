import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EXPRESSION_V1_OPS } from '../../catalogue/expression-parser.js';
import { PRIMITIVE_KINDS } from '../../catalogue/value-types.js';
import { buildExpressionVectors } from '../sync/computed-vectors/build.js';

import type {
  ExpressionEvaluation,
  ExpressionUnavailableReason,
} from '../../catalogue/expression-types.js';
import type { ExpressionVector } from '../sync/computed-vectors/build.js';

const CONTRACTS_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'contracts',
  'expression-vectors-v1.json'
);

const REASONS: Record<ExpressionUnavailableReason, true> = {
  missing_dependency: true,
  reference_unresolved: true,
  reference_missing: true,
  reference_deleted: true,
  evaluation_error: true,
};

const ERROR_CODES: Record<Extract<ExpressionEvaluation, { state: 'error' }>['code'], true> = {
  invalid_value: true,
  integer_overflow: true,
  precision_overflow: true,
  division_by_zero: true,
};

const vectors = buildExpressionVectors();

function evaluated(vector: ExpressionVector) {
  return vector.expected.outcome === 'evaluated' ? vector.expected : null;
}

describe('expression vectors', () => {
  it('evaluates every expression-v1 op in at least one vector', () => {
    const covered = new Set(vectors.flatMap((vector) => evaluated(vector)?.ops ?? []));
    for (const op of EXPRESSION_V1_OPS)
      expect(covered.has(op), `no vector evaluates ${op}`).toBe(true);
  });

  it('produces an ok value of every primitive kind', () => {
    const kinds = new Set(
      vectors
        .filter((vector) => evaluated(vector)?.value.state === 'ok')
        .map((vector) => vector.field.kind)
    );
    for (const kind of PRIMITIVE_KINDS) expect(kinds.has(kind), `no ok ${kind} vector`).toBe(true);
  });

  it('reaches every unavailable reason and every evaluation error code', () => {
    const reasons = new Set(
      vectors.flatMap((vector) => {
        const value = evaluated(vector)?.value;
        return value?.state === 'unavailable' ? [value.reason] : [];
      })
    );
    for (const reason of Object.keys(REASONS)) expect(reasons.has(reason), reason).toBe(true);
    const codes = new Set<string | null | undefined>(
      vectors.map((vector) => evaluated(vector)?.evaluationErrorCode)
    );
    for (const code of Object.keys(ERROR_CODES)) expect(codes.has(code), code).toBe(true);
  });

  it('records overridden results and parser rejections', () => {
    expect(vectors.some((vector) => evaluated(vector)?.value.state === 'overridden')).toBe(true);
    const rejected = new Set(
      vectors.flatMap((vector) =>
        vector.expected.outcome === 'rejected' ? [vector.expected.code] : []
      )
    );
    expect([...rejected].toSorted()).toEqual([
      'expression_arity_invalid',
      'expression_node_invalid',
      'expression_nodes_exceeded',
      'expression_op_unknown',
      'expression_version_unknown',
      'field_id_invalid',
      'literal_invalid',
      'override_forbidden',
      'reference_hops_exceeded',
      'reference_path_invalid',
    ]);
  });

  it('names every vector uniquely', () => {
    expect(new Set(vectors.map((vector) => vector.name)).size).toBe(vectors.length);
  });

  it('matches the committed contracts/expression-vectors-v1.json exactly (drift)', () => {
    const committed: unknown = JSON.parse(readFileSync(CONTRACTS_PATH, 'utf8'));
    const regenerated: unknown = JSON.parse(JSON.stringify({ version: 1, vectors }));
    expect(regenerated).toEqual(committed);
  });
});
