import { addOrSubtract, divide, lessThan, multiply, negate } from './expression-arithmetic.js';
import { errorEvaluation, uniqueEvaluatedDependencies } from './expression-evaluation-shared.js';
import { evaluateRead } from './expression-reader.js';
import { canonicalExpressionResult } from './expression-result.js';

import type {
  EvaluatedDependency,
  ExpressionEvaluation,
  ExpressionSnapshot,
  ExpressionV1,
  ValidatedExpression,
} from './expression-types.js';
import type { PrimitiveWireValue } from './value-types.js';

function equal(left: PrimitiveWireValue, right: PrimitiveWireValue): boolean {
  if (typeof left !== 'object' || typeof right !== 'object') return left === right;
  if ('optionId' in left && 'optionId' in right) return left.optionId === right.optionId;
  if ('amount' in left && 'amount' in right)
    return left.amount === right.amount && left.unit === right.unit;
  if ('targetKind' in left && 'targetKind' in right)
    return left.targetKind === right.targetKind && left.targetId === right.targetId;
  return false;
}

function arithmetic(
  op: 'add' | 'subtract' | 'multiply' | 'divide',
  left: PrimitiveWireValue,
  right: PrimitiveWireValue,
  dependencies: readonly EvaluatedDependency[]
): ExpressionEvaluation {
  let result;
  if (op === 'add') result = addOrSubtract(left, right, false);
  else if (op === 'subtract') result = addOrSubtract(left, right, true);
  else if (op === 'multiply') result = multiply(left, right);
  else result = divide(left, right);
  return result.state === 'value'
    ? { state: 'value', value: result.value, dependencies }
    : errorEvaluation(result.code, dependencies);
}

function compare(
  op: 'equal' | 'less_than',
  left: PrimitiveWireValue,
  right: PrimitiveWireValue,
  dependencies: readonly EvaluatedDependency[]
): ExpressionEvaluation {
  if (op === 'equal') return { state: 'value', value: equal(left, right), dependencies };
  const compared = lessThan(left, right);
  return compared === null
    ? errorEvaluation('invalid_value', dependencies)
    : { state: 'value', value: compared, dependencies };
}

function booleanValue(
  op: 'and' | 'or',
  left: PrimitiveWireValue,
  right: PrimitiveWireValue,
  dependencies: readonly EvaluatedDependency[]
): ExpressionEvaluation {
  if (typeof left !== 'boolean' || typeof right !== 'boolean')
    return errorEvaluation('invalid_value', dependencies);
  return {
    state: 'value',
    value: op === 'and' ? left && right : left || right,
    dependencies,
  };
}

function binaryValue(
  expression: Extract<ExpressionV1, { left: ExpressionV1 }>,
  left: PrimitiveWireValue,
  right: PrimitiveWireValue,
  dependencies: readonly EvaluatedDependency[]
): ExpressionEvaluation {
  if (
    expression.op === 'add' ||
    expression.op === 'subtract' ||
    expression.op === 'multiply' ||
    expression.op === 'divide'
  )
    return arithmetic(expression.op, left, right, dependencies);
  if (expression.op === 'equal' || expression.op === 'less_than')
    return compare(expression.op, left, right, dependencies);
  if (expression.op === 'concat') {
    if (typeof left !== 'string' || typeof right !== 'string')
      return errorEvaluation('invalid_value', dependencies);
    return { state: 'value', value: `${left}${right}`, dependencies };
  }
  return booleanValue(expression.op, left, right, dependencies);
}

function evaluateBinary(
  expression: Extract<ExpressionV1, { left: ExpressionV1 }>,
  snapshot: ExpressionSnapshot
): ExpressionEvaluation {
  const left = evaluateNode(expression.left, snapshot);
  if (left.state !== 'value') return left;
  if (expression.op === 'and' && left.value === false) return left;
  if (expression.op === 'or' && left.value === true) return left;
  const right = evaluateNode(expression.right, snapshot);
  if (right.state !== 'value') return mergeDependencies(right, left.dependencies);
  return binaryValue(
    expression,
    left.value,
    right.value,
    uniqueEvaluatedDependencies([...left.dependencies, ...right.dependencies])
  );
}

function mergeDependencies(
  evaluation: ExpressionEvaluation,
  dependencies: readonly EvaluatedDependency[]
): ExpressionEvaluation {
  return {
    ...evaluation,
    dependencies: uniqueEvaluatedDependencies([...dependencies, ...evaluation.dependencies]),
  };
}

function evaluateUnary(
  expression: Extract<ExpressionV1, { value: ExpressionV1 }>,
  snapshot: ExpressionSnapshot
): ExpressionEvaluation {
  const value = evaluateNode(expression.value, snapshot);
  if (value.state !== 'value') return value;
  if (expression.op === 'not') {
    if (typeof value.value !== 'boolean')
      return errorEvaluation('invalid_value', value.dependencies);
    return { ...value, value: !value.value };
  }
  const result = negate(value.value);
  return result.state === 'value'
    ? { ...value, value: result.value }
    : errorEvaluation(result.code, value.dependencies);
}

function evaluateConditional(
  expression: Extract<ExpressionV1, { op: 'if' }>,
  snapshot: ExpressionSnapshot
): ExpressionEvaluation {
  const condition = evaluateNode(expression.condition, snapshot);
  if (condition.state !== 'value') return condition;
  if (typeof condition.value !== 'boolean')
    return errorEvaluation('invalid_value', condition.dependencies);
  const branch = evaluateNode(
    condition.value ? expression.thenBranch : expression.elseBranch,
    snapshot
  );
  return mergeDependencies(branch, condition.dependencies);
}

function evaluateNode(
  expression: ExpressionV1,
  snapshot: ExpressionSnapshot
): ExpressionEvaluation {
  if (expression.op === 'literal')
    return { state: 'value', value: expression.value, dependencies: [] };
  if (expression.op === 'read') return evaluateRead(expression, snapshot);
  if ('value' in expression) return evaluateUnary(expression, snapshot);
  if (expression.op === 'if') return evaluateConditional(expression, snapshot);
  return evaluateBinary(expression, snapshot);
}

/** Evaluates a validated expression entirely against one synchronous item snapshot. */
export function evaluateExpression(
  expression: ValidatedExpression,
  snapshot: ExpressionSnapshot
): ExpressionEvaluation {
  const evaluated = evaluateNode(expression.ast, snapshot);
  if (evaluated.state !== 'value') return evaluated;
  const canonical = canonicalExpressionResult(evaluated.value, expression.resultType);
  return canonical === null
    ? errorEvaluation('invalid_value', evaluated.dependencies)
    : { ...evaluated, value: canonical };
}
