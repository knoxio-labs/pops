import { combineUnits, formatUnitTerm, termDimension } from '../contract/measurement-units.js';
import { inferLiteralType } from './expression-literal-validator.js';
import { inferReadType } from './expression-read-validator.js';
import {
  expressionFail,
  expressionType,
  requireExpressionType,
  requireNumericType,
} from './expression-validation-shared.js';

import type { ExpressionV1, ExpressionValueType } from './expression-types.js';
import type { ExpressionValidationContext } from './expression-validation-shared.js';

function inferBooleanBinary(
  node: Extract<ExpressionV1, { left: ExpressionV1 }>,
  context: ExpressionValidationContext,
  path: string
): ExpressionValueType {
  inferExpressionType(node.left, context, `${path}.left`, expressionType('boolean'));
  inferExpressionType(node.right, context, `${path}.right`, expressionType('boolean'));
  return expressionType('boolean');
}

function inferCompared(
  node: Extract<ExpressionV1, { left: ExpressionV1 }>,
  context: ExpressionValidationContext,
  path: string
): ExpressionValueType {
  const left = inferExpressionType(node.left, context, `${path}.left`);
  inferExpressionType(node.right, context, `${path}.right`, left);
  if (node.op === 'less_than') requireNumericType(left, path);
  return expressionType('boolean');
}

/**
 * Version 2 `multiply`/`divide` of a measurement: a measurement right side
 * derives the unit evaluation will produce (cm × cm is cm², cm ÷ mm a plain
 * decimal); anything else must be a decimal scale, as in version 1.
 */
function inferDerived(
  node: Extract<ExpressionV1, { left: ExpressionV1 }>,
  left: ExpressionValueType,
  context: ExpressionValidationContext,
  path: string
): ExpressionValueType {
  const right = inferExpressionType(node.right, context, `${path}.right`);
  if (right.kind !== 'measurement' || left.fixedUnit === null || right.fixedUnit === null) {
    requireExpressionType(right, expressionType('decimal'), `${path}.right`, true);
    return left;
  }
  const combined = combineUnits(left.fixedUnit, right.fixedUnit, node.op === 'divide' ? -1 : 1);
  if (combined === null)
    return expressionFail(
      path,
      'expression_unit_unsupported',
      `cannot derive a unit from ${left.fixedUnit} and ${right.fixedUnit}; write units as symbols joined by · with superscript powers`
    );
  if (combined.term.length === 0 || termDimension(combined.term).size === 0)
    return expressionType('decimal');
  return expressionType('measurement', formatUnitTerm(combined.term));
}

function inferValueBinary(
  node: Extract<ExpressionV1, { left: ExpressionV1 }>,
  context: ExpressionValidationContext,
  path: string
): ExpressionValueType {
  const left = inferExpressionType(node.left, context, `${path}.left`);
  const scaled = (node.op === 'multiply' || node.op === 'divide') && left.kind === 'measurement';
  if (scaled && context.dimensional) return inferDerived(node, left, context, path);
  inferExpressionType(
    node.right,
    context,
    `${path}.right`,
    scaled ? expressionType('decimal') : left
  );
  if (node.op === 'concat') {
    if (left.kind !== 'short_text' && left.kind !== 'long_text')
      expressionFail(path, 'expression_text_required', 'concat requires matching text values');
    return left;
  }
  requireNumericType(left, path);
  return left;
}

function inferBinary(
  node: Extract<ExpressionV1, { left: ExpressionV1 }>,
  context: ExpressionValidationContext,
  path: string
): ExpressionValueType {
  if (node.op === 'and' || node.op === 'or') return inferBooleanBinary(node, context, path);
  if (node.op === 'equal' || node.op === 'less_than') return inferCompared(node, context, path);
  return inferValueBinary(node, context, path);
}

function inferConditional(
  node: Extract<ExpressionV1, { op: 'if' }>,
  context: ExpressionValidationContext,
  path: string,
  expected: ExpressionValueType | undefined
): ExpressionValueType {
  inferExpressionType(node.condition, context, `${path}.condition`, expressionType('boolean'));
  const result = inferExpressionType(node.thenBranch, context, `${path}.then`, expected);
  inferExpressionType(node.elseBranch, context, `${path}.else`, result);
  return result;
}

function inferCoalesce(
  node: Extract<ExpressionV1, { op: 'coalesce' }>,
  context: ExpressionValidationContext,
  path: string,
  expected: ExpressionValueType | undefined
): ExpressionValueType {
  let result = expected;
  node.values.forEach((value, index) => {
    result = inferExpressionType(value, context, `${path}.values.${index}`, result);
  });
  if (result === undefined) return expressionFail(path, 'expression_arity_invalid', 'is empty');
  return result;
}

/** Infers and verifies one expression tree against its declared result type. */
export function inferExpressionType(
  node: ExpressionV1,
  context: ExpressionValidationContext,
  path: string,
  expected?: ExpressionValueType
): ExpressionValueType {
  let result: ExpressionValueType;
  if (node.op === 'literal') result = inferLiteralType(node, expected, path, context.dimensional);
  else if (node.op === 'read') result = inferReadType(node, context, path);
  else if ('value' in node) {
    if (node.op === 'not') {
      inferExpressionType(node.value, context, `${path}.value`, expressionType('boolean'));
      result = expressionType('boolean');
    } else
      result = requireNumericType(inferExpressionType(node.value, context, `${path}.value`), path);
  } else if (node.op === 'if') result = inferConditional(node, context, path, expected);
  else if (node.op === 'coalesce') result = inferCoalesce(node, context, path, expected);
  else result = inferBinary(node, context, path);
  return expected === undefined
    ? result
    : requireExpressionType(result, expected, path, context.dimensional);
}
