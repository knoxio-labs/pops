/**
 * Computed-value vectors (Inventory ADR-002 D11): every case is parsed and
 * evaluated by the server's own parser, evaluator and sync projection, and the
 * recorded result is what the phone's evaluator must reproduce byte for byte.
 * `scripts/generate-expression-vectors.ts` writes {@link buildExpressionVectors}
 * to `contracts/expression-vectors-v1.json`; the drift test regenerates it.
 */
import { evaluateComputedValue } from '../../../catalogue/computed-values.js';
import { computedWire } from '../../../catalogue/effective-item-value-wire.js';
import { parseExpression } from '../../../catalogue/expression-parser.js';
import { ExpressionValidationError } from '../../../catalogue/expression-types.js';
import { toComputedWire } from '../computed-wire.js';
import { EXPRESSION_VECTOR_CASES } from './cases.js';
import { FIELD, ITEM, VECTOR_CATALOGUE_REVISION, VECTOR_OVERRIDE_REVISION } from './fixture.js';

import type {
  ExpressionSnapshot,
  ExpressionV1,
  SnapshotFieldValue,
} from '../../../catalogue/expression-types.js';
import type { ReadItemFieldValue } from '../../../catalogue/item-value-types.js';
import type { SyncComputedValue } from '../../../contract/rest-sync-computed-schemas.js';
import type {
  ExpressionVectorCase,
  VectorField,
  VectorItem,
  VectorResultField,
} from './fixture.js';

type EvaluationErrorCode =
  | 'invalid_value'
  | 'integer_overflow'
  | 'precision_overflow'
  | 'division_by_zero';

/** What the server did with one case. */
export type ExpressionVectorExpectation =
  | { readonly outcome: 'rejected'; readonly code: string; readonly path: string }
  | {
      readonly outcome: 'evaluated';
      readonly ops: readonly ExpressionV1['op'][];
      readonly evaluationErrorCode: EvaluationErrorCode | null;
      readonly value: SyncComputedValue;
    };

/** One generated vector: a fully explicit case plus the server's result. */
export interface ExpressionVector {
  readonly name: string;
  readonly expressionVersion: number;
  readonly expression: unknown;
  readonly field: VectorResultField;
  readonly override: { readonly value: unknown; readonly catalogueRevision: number } | null;
  readonly rootItemId: string;
  readonly items: readonly VectorItem[];
  readonly expected: ExpressionVectorExpectation;
}

function snapshotField(entry: VectorField): SnapshotFieldValue {
  if (entry.state === 'value') return entry;
  return {
    state: 'unavailable',
    reason: entry.reason,
    fieldId: entry.failedFieldId,
    traversedItemIds: entry.traversedItemIds,
    revision: entry.revision,
    ...(entry.dependencies === undefined ? {} : { dependencies: entry.dependencies }),
    ...(entry.missingInputs === undefined ? {} : { missingInputs: entry.missingInputs }),
  };
}

function snapshot(items: readonly VectorItem[]): ExpressionSnapshot {
  const byId = new Map(items.map((entry) => [entry.id, entry]));
  return {
    rootItemId: ITEM.root,
    readItem: (itemId) => {
      const entry = byId.get(itemId);
      if (entry === undefined) return { state: 'missing' };
      if (entry.state !== 'resolved') return { state: entry.state };
      return {
        state: 'resolved',
        item: {
          id: entry.id,
          revision: entry.revision,
          fields: new Map(entry.fields.map((value) => [value.fieldId, snapshotField(value)])),
        },
      };
    },
    readField: (itemId, fieldId) => {
      const entry = byId.get(itemId);
      if (entry?.state !== 'resolved') return undefined;
      const value = entry.fields.find((candidate) => candidate.fieldId === fieldId);
      return value === undefined ? undefined : snapshotField(value);
    },
  };
}

function ops(node: ExpressionV1, found: Set<ExpressionV1['op']>): Set<ExpressionV1['op']> {
  found.add(node.op);
  if (node.op === 'literal' || node.op === 'read') return found;
  if (node.op === 'coalesce') {
    for (const value of node.values) ops(value, found);
    return found;
  }
  if ('value' in node) return ops(node.value, found);
  if (node.op === 'if') {
    ops(node.condition, found);
    ops(node.thenBranch, found);
    return ops(node.elseBranch, found);
  }
  ops(node.left, found);
  return ops(node.right, found);
}

function overrideRows(vectorCase: ExpressionVectorCase, fieldId: string): ReadItemFieldValue[] {
  if (vectorCase.override === undefined) return [];
  return [
    {
      fieldId,
      source: 'override',
      catalogueRevision: VECTOR_OVERRIDE_REVISION,
      values: [vectorCase.override],
    },
  ];
}

function expect(
  vectorCase: ExpressionVectorCase,
  field: VectorResultField,
  items: readonly VectorItem[]
): ExpressionVectorExpectation {
  let ast: ExpressionV1;
  try {
    ast = parseExpression(vectorCase.expressionVersion ?? 1, vectorCase.expression);
    let evaluationErrorCode: EvaluationErrorCode | null = null;
    const effective = evaluateComputedValue({
      allowOverride: field.allowOverride,
      catalogueRevision: VECTOR_CATALOGUE_REVISION,
      expression: {
        ast,
        version: vectorCase.expressionVersion ?? 1,
        dependencies: [],
        field: { typeId: 'vector', fieldId: field.fieldId },
        resultType: { kind: field.kind, fixedUnit: field.fixedUnit },
      },
      fieldId: field.fieldId,
      override:
        vectorCase.override === undefined
          ? { state: 'absent' }
          : { state: 'value', value: vectorCase.override },
      snapshot: snapshot(items),
      onEvaluationError: (code) => {
        evaluationErrorCode = code;
      },
    });
    const value = toComputedWire(
      ITEM.root,
      computedWire(field.fieldId, effective),
      overrideRows(vectorCase, field.fieldId)
    );
    if (value === null) throw new Error(`${vectorCase.name}: a computed field projected as stored`);
    return {
      outcome: 'evaluated',
      ops: [...ops(ast, new Set())].toSorted(),
      evaluationErrorCode,
      value,
    };
  } catch (error) {
    if (!(error instanceof ExpressionValidationError)) throw error;
    return { outcome: 'rejected', code: error.code, path: error.path };
  }
}

function withRoot(items: readonly VectorItem[] | undefined): readonly VectorItem[] {
  const listed = items ?? [];
  if (listed.some((entry) => entry.id === ITEM.root)) return listed;
  return [{ id: ITEM.root, state: 'resolved', revision: 3, fields: [] }, ...listed];
}

function buildVector(vectorCase: ExpressionVectorCase): ExpressionVector {
  const field: VectorResultField = {
    fieldId: FIELD.computed,
    kind: vectorCase.kind,
    fixedUnit: vectorCase.fixedUnit ?? null,
    allowOverride: vectorCase.allowOverride ?? false,
  };
  const items = withRoot(vectorCase.items);
  return {
    name: vectorCase.name,
    expressionVersion: vectorCase.expressionVersion ?? 1,
    expression: vectorCase.expression,
    field,
    override:
      vectorCase.override === undefined
        ? null
        : { value: vectorCase.override, catalogueRevision: VECTOR_OVERRIDE_REVISION },
    rootItemId: ITEM.root,
    items,
    expected: expect(vectorCase, field, items),
  };
}

/** Evaluates every case through the server's own code, in case order. */
export function buildExpressionVectors(): readonly ExpressionVector[] {
  return EXPRESSION_VECTOR_CASES.map(buildVector);
}
