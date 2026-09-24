import { addOrSubtract, divide, lessThan, multiply } from './expression-arithmetic.js';
import {
  dimensionalAddOrSubtract,
  dimensionalLessThan,
  dimensionalMeasurementEqual,
  dimensionalMultiplyOrDivide,
} from './expression-dimensional.js';
import { errorEvaluation } from './expression-evaluation-shared.js';

import type { ArithmeticResult } from './expression-arithmetic.js';
import type {
  EvaluatedDependency,
  ExpressionEvaluation,
  ExpressionV1,
} from './expression-types.js';
import type { PrimitiveWireValue } from './value-types.js';

/** The revisions both operands read, and whether version-2 unit semantics apply. */
export interface BinaryContext {
  readonly dependencies: readonly EvaluatedDependency[];
  readonly dimensional: boolean;
}

type BinaryOp = Extract<ExpressionV1, { left: ExpressionV1 }>['op'];

function equal(left: PrimitiveWireValue, right: PrimitiveWireValue): boolean {
  if (typeof left !== 'object' || typeof right !== 'object') return left === right;
  if ('optionId' in left && 'optionId' in right) return left.optionId === right.optionId;
  if ('amount' in left && 'amount' in right)
    return left.amount === right.amount && left.unit === right.unit;
  if ('targetKind' in left && 'targetKind' in right)
    return left.targetKind === right.targetKind && left.targetId === right.targetId;
  return false;
}

function lifted(result: ArithmeticResult, context: BinaryContext): ExpressionEvaluation {
  return result.state === 'value'
    ? { state: 'value', value: result.value, dependencies: context.dependencies }
    : errorEvaluation(result.code, context.dependencies);
}

function arithmetic(
  op: 'add' | 'subtract' | 'multiply' | 'divide',
  left: PrimitiveWireValue,
  right: PrimitiveWireValue,
  dimensional: boolean
): ArithmeticResult {
  if (dimensional) {
    if (op === 'add' || op === 'subtract')
      return dimensionalAddOrSubtract(left, right, op === 'subtract');
    return dimensionalMultiplyOrDivide(left, right, op === 'divide');
  }
  if (op === 'add') return addOrSubtract(left, right, false);
  if (op === 'subtract') return addOrSubtract(left, right, true);
  if (op === 'multiply') return multiply(left, right);
  return divide(left, right);
}

function compared(
  op: 'equal' | 'less_than',
  left: PrimitiveWireValue,
  right: PrimitiveWireValue,
  dimensional: boolean
): ArithmeticResult {
  if (op === 'equal') {
    if (
      dimensional &&
      typeof left === 'object' &&
      'amount' in left &&
      typeof right === 'object' &&
      'amount' in right
    )
      return dimensionalMeasurementEqual(left, right);
    return { state: 'value', value: equal(left, right) };
  }
  if (dimensional) return dimensionalLessThan(left, right);
  const less = lessThan(left, right);
  return less === null
    ? { state: 'error', code: 'invalid_value' }
    : { state: 'value', value: less };
}

function combined(
  op: BinaryOp,
  left: PrimitiveWireValue,
  right: PrimitiveWireValue,
  dimensional: boolean
): ArithmeticResult {
  if (op === 'add' || op === 'subtract' || op === 'multiply' || op === 'divide')
    return arithmetic(op, left, right, dimensional);
  if (op === 'equal' || op === 'less_than') return compared(op, left, right, dimensional);
  return textOrLogic(op, left, right);
}

function textOrLogic(
  op: 'concat' | 'and' | 'or',
  left: PrimitiveWireValue,
  right: PrimitiveWireValue
): ArithmeticResult {
  if (op === 'concat')
    return typeof left === 'string' && typeof right === 'string'
      ? { state: 'value', value: `${left}${right}` }
      : { state: 'error', code: 'invalid_value' };
  if (typeof left !== 'boolean' || typeof right !== 'boolean')
    return { state: 'error', code: 'invalid_value' };
  return { state: 'value', value: op === 'and' ? left && right : left || right };
}

/** Applies one binary op to two evaluated operands. */
export function binaryValue(
  op: BinaryOp,
  left: PrimitiveWireValue,
  right: PrimitiveWireValue,
  context: BinaryContext
): ExpressionEvaluation {
  return lifted(combined(op, left, right, context.dimensional), context);
}
