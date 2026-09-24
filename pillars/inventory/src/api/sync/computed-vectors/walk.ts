import { parseExpression } from '../../../catalogue/expression-parser.js';
import { ExpressionValidationError } from '../../../catalogue/expression-types.js';
import { FIELD_KINDS } from './fixture.js';

import type { ExpressionV1 } from '../../../catalogue/expression-types.js';
import type { PrimitiveKind } from '../../../catalogue/value-types.js';
import type { ExpressionVectorCase } from './fixture.js';

function children(node: ExpressionV1): readonly ExpressionV1[] {
  if (node.op === 'literal' || node.op === 'read') return [];
  if (node.op === 'coalesce') return node.values;
  if ('value' in node) return [node.value];
  if (node.op === 'if') return [node.condition, node.thenBranch, node.elseBranch];
  return [node.left, node.right];
}

function collectOps(node: ExpressionV1, found: Set<ExpressionV1['op']>): Set<ExpressionV1['op']> {
  found.add(node.op);
  for (const child of children(node)) collectOps(child, found);
  return found;
}

function readFieldIds(node: ExpressionV1, found: Set<string>): Set<string> {
  if (node.op === 'read') found.add(node.fieldId);
  for (const child of children(node)) readFieldIds(child, found);
  return found;
}

/** The kinds of the fields a case reads; empty when its expression does not parse. */
export function vectorFieldKinds(
  vectorCase: ExpressionVectorCase
): Readonly<Record<string, PrimitiveKind>> {
  let ast: ExpressionV1;
  try {
    ast = parseExpression(vectorCase.expressionVersion ?? 1, vectorCase.expression);
  } catch (error) {
    if (error instanceof ExpressionValidationError) return {};
    throw error;
  }
  const kinds = vectorCase.fieldKinds ?? FIELD_KINDS;
  const read: Record<string, PrimitiveKind> = {};
  for (const fieldId of [...readFieldIds(ast, new Set())].toSorted()) {
    const kind = kinds[fieldId];
    if (kind !== undefined) read[fieldId] = kind;
  }
  return read;
}

/** Every op a parsed expression uses, sorted. */
export function expressionOps(ast: ExpressionV1): readonly ExpressionV1['op'][] {
  return [...collectOps(ast, new Set())].toSorted();
}
